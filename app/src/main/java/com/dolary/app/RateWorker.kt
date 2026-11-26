package com.dolary.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Periodic background refresh. WorkManager survives reboots/app updates, runs only with a network
 * connection and respects Doze / battery saver (minimum period is 15 minutes).
 */
class RateWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    companion object {
        private const val WORK_NAME = "dolary_rate_refresh"
        private const val KEY_NOTIFICATION_BASELINE = "notification_rates_baseline"

        fun schedule(context: Context, intervalMinutes: Int) {
            val minutes = when (intervalMinutes) {
                15, 30, 60 -> intervalMinutes
                else -> 15
            }.toLong()
            val request = PeriodicWorkRequestBuilder<RateWorker>(minutes, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
                )
                .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.MINUTES)
                .build()
            // UPDATE: picks up a new interval, but leaves the existing schedule alone when nothing changed.
            WorkManager.getInstance(context.applicationContext)
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK_NAME)
        }
    }

    override fun doWork(): Result {
        val context = applicationContext
        val prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(MainActivity.KEY_AUTO_UPDATE, true)) return Result.success()

        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(MainActivity.RATES_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8000
                readTimeout = 8000
                useCaches = false
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Cache-Control", "no-cache")
                setRequestProperty("User-Agent", "Dolary Android App/1.4 background")
            }
            val code = connection.responseCode
            if (code !in 200..299) return Result.retry()

            val response = BufferedReader(
                InputStreamReader(connection.inputStream, StandardCharsets.UTF_8)
            ).use { it.readText() }
            val parsed = JSONObject(response)
            if (parsed.optJSONArray("cities") == null) return Result.retry()
            val currentRates = parseRates(response)
            // Never replace a known-good cache with an empty, malformed, or unusable response.
            if (currentRates.isEmpty()) return Result.retry()

            // Use an alert-only snapshot: the foreground UI also updates KEY_LAST_JSON,
            // which otherwise consumes the change before this worker can compare it.
            val previousForAlerts = prefs.getString(KEY_NOTIFICATION_BASELINE, null)
            val previousRates = previousForAlerts?.let { parseRates(it) } ?: emptyMap()
            prefs.edit().putString(KEY_NOTIFICATION_BASELINE, response).apply()

            // First successful run only seeds the baseline; it must not create a false alert.
            if (previousRates.isNotEmpty() && prefs.getBoolean(MainActivity.KEY_NOTIFICATIONS, true)) {
                notifyIfChanged(context, previousForAlerts!!, response, prefs)
            }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        } finally {
            connection?.disconnect()
        }
    }

    private fun notifyIfChanged(
        context: Context,
        oldJson: String,
        newJson: String,
        prefs: SharedPreferences
    ) {
        val oldMap = parseRates(oldJson)
        val newMap = parseRates(newJson)
        if (oldMap.isEmpty() || newMap.isEmpty()) return

        // Do not record a notification as delivered when Android has blocked it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = manager.getNotificationChannel(MainActivity.NOTIFICATION_CHANNEL_ID)
            if (channel != null && channel.importance == NotificationManager.IMPORTANCE_NONE) return
        }

        // Quiet hours suppress alerts only; the background price refresh still runs.
        if (isWithinQuietHours(prefs, System.currentTimeMillis())) return

        val favoritesRaw = prefs.getString(MainActivity.KEY_FAVORITES, "[]") ?: "[]"
        val favorites = parseStringArray(favoritesRaw)
        val selected = prefs.getString(MainActivity.KEY_SELECTED_PROVINCE, "بغداد") ?: "بغداد"
        val targetEnabled = prefs.getBoolean("target_alert_enabled", false)
        val targetProvince = prefs.getString("target_alert_province", "") ?: ""
        val targetRate = prefs.getInt("target_alert_rate", 0)
        val targetDirection = prefs.getString("target_alert_direction", "above") ?: "above"
        val targets = ((if (favorites.isNotEmpty()) favorites else listOf(selected)) +
            if (targetEnabled && targetProvince.isNotBlank()) listOf(targetProvince) else emptyList()).distinct()

        // Notify only for meaningful movements and avoid repeatedly alerting the same province.
        // Rates are expressed per USD 100, so a 25 IQD movement is a small but useful threshold.
        val lastAlertTimes = try {
            JSONObject(prefs.getString("notification_last_alert_times", "{}") ?: "{}")
        } catch (_: Exception) {
            JSONObject()
        }
        val now = System.currentTimeMillis()
        val cooldownMs = TimeUnit.MINUTES.toMillis(30)
        val changed = RateAlertEvaluator.evaluate(
            oldRates = oldMap,
            newRates = newMap,
            targetProvinces = targets,
            targetEnabled = targetEnabled,
            targetProvince = targetProvince,
            targetRate = targetRate,
            targetDirection = targetDirection,
            lastAlertTimes = targets.associateWith { lastAlertTimes.optLong(it, 0L) },
            nowMillis = now,
            cooldownMillis = cooldownMs
        ).map { Triple(it.province, it.oldRate, it.newRate) }
        if (changed.isEmpty()) return

        val history = try {
            JSONArray(prefs.getString(MainActivity.KEY_NOTIFICATION_HISTORY, "[]") ?: "[]")
        } catch (_: Exception) {
            JSONArray()
        }
        for (item in changed) {
            val delta = item.third - item.second
            history.put(JSONObject().apply {
                put("name", item.first)
                put("rate", item.third)
                put("change", delta)
                put("time", currentTime())
                put("timestamp", now)
            })
        }
        val trimmed = JSONArray()
        val start = maxOf(0, history.length() - 20)
        for (i in start until history.length()) trimmed.put(history.getJSONObject(i))
        prefs.edit().putString(MainActivity.KEY_NOTIFICATION_HISTORY, trimmed.toString()).apply()
        changed.forEach { item -> lastAlertTimes.put(item.first, now) }
        prefs.edit().putString("notification_last_alert_times", lastAlertTimes.toString()).apply()

        val first = changed.first()
        val difference = first.third - first.second
        val arrow = if (difference > 0) "↑" else "↓"
        val direction = if (difference > 0) "ارتفع" else "انخفض"
        val text = if (changed.size == 1) {
            "${first.first}: 100 دولار ${arrow} ${formatRate(first.third)} د.ع ($direction ${formatRate(kotlin.math.abs(difference))})"
        } else {
            "تغير السعر في ${changed.size} محافظات · ${first.first}: ${formatRate(first.third)} د.ع"
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(
                    MainActivity.NOTIFICATION_CHANNEL_ID,
                    "تغيّرات سعر الدولار",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply { description = "تنبيهات عند تغيّر سعر الدولار في المحافظات المفضلة" }
            )
        }
        val intent = Intent(context, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            context,
            9301,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val detailLines = changed.map { item ->
            val delta = item.third - item.second
            val directionMark = if (delta > 0) "↑" else "↓"
            "${item.first}: ${formatRate(item.third)} د.ع (${directionMark} ${formatRate(kotlin.math.abs(delta))})"
        }
        val notification = Notification.Builder(context, MainActivity.NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_dolary)
                        .setColor(0xFF1769FF.toInt())
            .setCategory(Notification.CATEGORY_STATUS)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentTitle(if (changed.size == 1) "دولاري • تغير سعر الدولار" else "دولاري • تحديث أسعار المحافظات")
            .setContentText(text)
            .setStyle(Notification.InboxStyle().setSummaryText("تحديث السوق الموازي").also { style ->
                detailLines.forEach { style.addLine(it) }
            })
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }

    private fun isWithinQuietHours(prefs: SharedPreferences, nowMillis: Long): Boolean {
        if (!prefs.getBoolean("quiet_hours_enabled", false)) return false
        val start = prefs.getString("quiet_hours_start", "22:00") ?: "22:00"
        val end = prefs.getString("quiet_hours_end", "08:00") ?: "08:00"
        return try {
            val a = start.split(":").map { it.toInt() }; val b = end.split(":").map { it.toInt() }
            if (a.size != 2 || b.size != 2) return false
            val c = java.util.Calendar.getInstance().apply { timeInMillis = nowMillis }
            val current = c.get(java.util.Calendar.HOUR_OF_DAY) * 60 + c.get(java.util.Calendar.MINUTE)
            val from = a[0] * 60 + a[1]; val to = b[0] * 60 + b[1]
            if (from < to) current >= from && current < to else current >= from || current < to
        } catch (_: Exception) { false }
    }

    private fun parseRates(json: String): Map<String, Int> {
        return try {
            val cities = JSONObject(json).optJSONArray("cities") ?: return emptyMap()
            val result = mutableMapOf<String, Int>()
            for (i in 0 until cities.length()) {
                val c = cities.optJSONObject(i) ?: continue
                val name = c.optJSONObject("name")?.optString("ar") ?: continue
                val rate = pickDisplayRate(c)
                if (rate != null) result[name] = rate
            }
            result
        } catch (_: Exception) {
            emptyMap()
        }
    }

    private fun pickDisplayRate(city: JSONObject): Int? {
        val primary = city.optDouble("usd_iqd_per_100", Double.NaN)
        val primaryTime = runCatching { java.time.Instant.parse(city.optString("updated_at", "")).toEpochMilli() }.getOrDefault(0L)
        var bestValue: Double? = if (primary.isFinite() && primary > 0.0 && primary <= Int.MAX_VALUE) primary else null
        var bestTime = if (bestValue != null) primaryTime else Long.MIN_VALUE

        val sides = city.optJSONArray("sides")
        if (sides != null) {
            for (i in 0 until sides.length()) {
                val s = sides.optJSONObject(i) ?: continue
                if (!s.isNull("side")) continue
                val value = s.optDouble("usd_iqd_per_100", Double.NaN)
                if (!value.isFinite() || value <= 0.0 || value > Int.MAX_VALUE) continue
                val time = runCatching { java.time.Instant.parse(s.optString("updated_at", "")).toEpochMilli() }.getOrDefault(0L)
                if (bestValue == null || time > bestTime) {
                    bestValue = value
                    bestTime = time
                }
            }
        }
        return bestValue?.roundToIntSafe()
    }

    private fun parseStringArray(raw: String): List<String> {
        return try {
            val arr = JSONArray(raw)
            buildList { for (i in 0 until arr.length()) add(arr.optString(i)) }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun formatRate(value: Int): String = String.format(Locale.US, "%,d", value)

    private fun currentTime(): String = java.text.SimpleDateFormat("yyyy/MM/dd  HH:mm", Locale.getDefault()).format(java.util.Date())

    private fun Double.roundToIntSafe(): Int = kotlin.math.round(this).toInt()
}
