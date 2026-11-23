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

            val previous = prefs.getString(MainActivity.KEY_LAST_JSON, null)
            val previousRates = previous?.let { parseRates(it) } ?: emptyMap()
            prefs.edit().putString(MainActivity.KEY_LAST_JSON, response).apply()

            if (prefs.getBoolean(MainActivity.KEY_NOTIFICATIONS, true) && previousRates.isNotEmpty()) {
                notifyIfChanged(context, previous!!, response, prefs)
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

        val favoritesRaw = prefs.getString(MainActivity.KEY_FAVORITES, "[]") ?: "[]"
        val favorites = parseStringArray(favoritesRaw)
        val selected = prefs.getString(MainActivity.KEY_SELECTED_PROVINCE, "بغداد") ?: "بغداد"
        val targets = if (favorites.isNotEmpty()) favorites else listOf(selected)

        val changed = targets.mapNotNull { name ->
            val oldRate = oldMap[name]
            val newRate = newMap[name]
            if (oldRate == null || newRate == null || oldRate == newRate) null
            else Triple(name, oldRate, newRate)
        }
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
            })
        }
        val trimmed = JSONArray()
        val start = maxOf(0, history.length() - 20)
        for (i in start until history.length()) trimmed.put(history.getJSONObject(i))
        prefs.edit().putString(MainActivity.KEY_NOTIFICATION_HISTORY, trimmed.toString()).apply()

        val first = changed.first()
        val difference = first.third - first.second
        val arrow = if (difference > 0) "↑" else "↓"
        val direction = if (difference > 0) "ارتفع" else "انخفض"
        val text = if (changed.size == 1) {
            "${first.first}: 100 دولار ${arrow} ${formatRate(first.third)} د.ع ($direction ${formatRate(kotlin.math.abs(difference))})"
        } else {
            "تغير السعر في ${changed.size} محافظات · ${first.first}: ${formatRate(first.third)} د.ع"
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
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
        val notification = Notification.Builder(context, MainActivity.NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_dolary)
            .setLargeIcon(BitmapFactory.decodeResource(context.resources, R.drawable.ic_notification_large))
            .setColor(0xFF1769FF.toInt())
            .setContentTitle("دولاري • تحديث السعر")
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
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
        val sides = city.optJSONArray("sides")
        if (sides != null) {
            for (i in 0 until sides.length()) {
                val s = sides.optJSONObject(i) ?: continue
                if (s.isNull("side")) {
                    val value = s.optDouble("usd_iqd_per_100", Double.NaN)
                    if (value.isFinite() && value > 0.0 && value <= Int.MAX_VALUE) return value.roundToIntSafe()
                }
            }
        }
        val primary = city.optDouble("usd_iqd_per_100", Double.NaN)
        return if (primary.isFinite() && primary > 0.0 && primary <= Int.MAX_VALUE) primary.roundToIntSafe() else null
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

    private fun currentTime(): String = java.text.SimpleDateFormat("HH:mm", Locale.getDefault()).format(java.util.Date())

    private fun Double.roundToIntSafe(): Int = kotlin.math.round(this).toInt()
}
