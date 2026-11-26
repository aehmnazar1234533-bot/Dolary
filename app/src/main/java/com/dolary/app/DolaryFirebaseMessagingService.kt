package com.dolary.app

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class DolaryFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val PUSH_API = "https://dolary.aehmnazar-1234533.workers.dev"
        private const val HISTORY_LIMIT = 30
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        registerToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val title = message.data["title"]?.takeIf { it.isNotBlank() } ?: "دولاري"
        val body = message.data["body"]?.takeIf { it.isNotBlank() } ?: "لديك إشعار جديد من دولاري."
        val url = message.data["url"] ?: ""
        val id = message.data["id"] ?: ("android-" + System.currentTimeMillis())

        saveNotification(title, body, url, id)
        showNotification(title, body, url, id)
    }

    private fun registerToken(token: String) {
        Thread {
            try {
                val connection = (URL(PUSH_API + "/api/android/register").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 8000
                    readTimeout = 8000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Origin", "https://aehamtech.top")
                }
                val payload = JSONObject().apply {
                    put("token", token)
                    put("app", "dolary-android")
                }.toString()
                connection.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }
                connection.responseCode
                connection.disconnect()
            } catch (_: Exception) {
                // Registration is retried automatically by FCM when a new token is issued.
            }
        }.start()
    }

    private fun saveNotification(title: String, body: String, url: String, id: String) {
        val prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        val history = try {
            JSONArray(prefs.getString(MainActivity.KEY_NOTIFICATION_HISTORY, "[]") ?: "[]")
        } catch (_: Exception) {
            JSONArray()
        }

        history.put(JSONObject().apply {
            put("title", title)
            put("body", body)
            put("url", url)
            put("id", id)
            put("time", java.text.SimpleDateFormat(
                "yyyy/MM/dd  HH:mm",
                java.util.Locale.getDefault()
            ).format(java.util.Date()))
            put("timestamp", System.currentTimeMillis())
            put("type", "broadcast")
        })

        val trimmed = JSONArray()
        val start = maxOf(0, history.length() - HISTORY_LIMIT)
        for (i in start until history.length()) {
            trimmed.put(history.getJSONObject(i))
        }
        prefs.edit().putString(MainActivity.KEY_NOTIFICATION_HISTORY, trimmed.toString()).apply()
    }

    private fun showNotification(title: String, body: String, url: String, id: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val intent = Intent(this, MainActivity::class.java).apply {
            putExtra("notification_url", url)
            putExtra("notification_id", id)
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = Notification.Builder(this, MainActivity.NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_dolary)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify(id.hashCode(), notification)
    }
}
