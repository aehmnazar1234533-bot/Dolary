package com.dolary.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.provider.Settings
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: View
    private lateinit var statusSpacer: View
    private lateinit var navSpacer: View
    private lateinit var adContainer: FrameLayout
    private var adView: AdView? = null
    private lateinit var adMobConsentManager: AdMobConsentManager
    private lateinit var appOpenAdManager: AppOpenAdManager
    private lateinit var prefs: SharedPreferences
    private val mainHandler = Handler(Looper.getMainLooper())
    private val ratesExecutor = Executors.newSingleThreadExecutor()
    private val ratesRequestLock = Any()
    @Volatile private var activeRatesConnection: HttpURLConnection? = null

    companion object {
        const val PREFS_NAME = "dolary_prefs"
        const val KEY_LAST_JSON = "last_rates_json"
        const val KEY_NOTIFICATIONS = "notifications_enabled"
        const val KEY_AUTO_UPDATE = "auto_update_enabled"
        const val KEY_INTERVAL_MIN = "update_interval_minutes"
        const val KEY_SELECTED_PROVINCE = "selected_province"
        const val KEY_FAVORITES = "favorites_json"
        const val KEY_NOTIFICATION_HISTORY = "notification_history"
        const val KEY_DARK_MODE = "dark_mode_last"
        const val KEY_PERMISSION_ASKED = "notification_permission_asked"
        const val RATES_URL = "https://xeiqd.com/rates.json"
        const val NOTIFICATION_CHANNEL_ID = "dolary_rate_changes"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        createNotificationChannel()

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        statusSpacer = findViewById(R.id.statusSpacer)
        navSpacer = findViewById(R.id.navSpacer)
        adContainer = findViewById(R.id.adContainer)
        adMobConsentManager = AdMobConsentManager(this)
        appOpenAdManager = AppOpenAdManager()
        setupAds()

        // Edge-to-edge is enforced on recent Android versions: size the coloured bars from the real insets.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val root = findViewById<View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            statusSpacer.layoutParams.height = bars.top
            navSpacer.layoutParams.height = bars.bottom
            v.setPadding(bars.left, 0, bars.right, 0)
            statusSpacer.requestLayout()
            navSpacer.requestLayout()
            insets
        }
        updateSystemBars()

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        // The page is bundled locally and does not need WebView network access.
        webView.settings.blockNetworkLoads = true
        // File-URL cross-origin access remains disabled by WebView defaults.
        // The bundled asset is loaded directly; JavaScript cannot access other files.
        webView.settings.javaScriptCanOpenWindowsAutomatically = false
        webView.settings.setSupportMultipleWindows(false)
        webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webView.settings.safeBrowsingEnabled = true
        webView.settings.loadsImagesAutomatically = true
        webView.settings.builtInZoomControls = false
        webView.settings.displayZoomControls = false
        webView.settings.setSupportZoom(false)
        webView.setBackgroundColor(Color.TRANSPARENT)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                // The UI is fully local: never navigate away from the bundled page.
                val uri = request?.url ?: return true
                // Only the exact bundled HTML document is allowed to navigate inside this WebView.
                // All external URLs and other local files are blocked.
                val isBundledPage = uri.scheme == "file" &&
                    uri.host.isNullOrEmpty() &&
                    uri.path == "/android_asset/index.html"
                return !isBundledPage
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progressBar.visibility = View.GONE
                pushCachedDataToWebView()
                fetchRates()
                scheduleBackgroundUpdates()

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    prefs.getBoolean(KEY_NOTIFICATIONS, true) &&
                    !prefs.getBoolean(KEY_PERMISSION_ASKED, false) &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                ) {
                    prefs.edit().putBoolean(KEY_PERMISSION_ASKED, true).apply()
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7001)
                }
            }
        }

        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("(window.handleBack && window.handleBack()) === true") { result ->
                    if (result != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })

        webView.loadUrl("file:///android_asset/index.html")
    }


    private fun setupAds() {
        // The banner is created in code: AdView allows its unit ID and size to be set only once,
        // so we never set them in the XML as well.
        try {
            val banner = AdView(this)
            banner.adUnitId = "ca-app-pub-9157735624204920/8725638919"
            banner.setAdSize(getAdaptiveBannerSize())
            adContainer.addView(
                banner,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    android.view.Gravity.CENTER
                )
            )
            adView = banner

            adMobConsentManager.gatherConsent {
                try {
                    adMobConsentManager.initializeAdsIfAllowed()
                    runOnUiThread {
                        try {
                            if (!isFinishing && !isDestroyed && adMobConsentManager.canRequestAds()) {
                                adContainer.visibility = View.VISIBLE
                                adView?.loadAd(AdRequest.Builder().build())
                                appOpenAdManager.loadAd(this@MainActivity)
                            }
                            webView.evaluateJavascript("window.AndroidBridge && AndroidBridge.setPrivacyOptionsVisible && AndroidBridge.setPrivacyOptionsVisible(${adMobConsentManager.privacyOptionsRequired()});", null)
                        } catch (_: Exception) {
                        }
                    }
                } catch (_: Exception) {
                }
            }
        } catch (_: Exception) {
            // Ads must never be able to crash the app.
            adContainer.visibility = View.GONE
        }
    }

    private fun getAdaptiveBannerSize(): AdSize {
        val displayMetrics = resources.displayMetrics
        val adWidthPixels = adContainer.width.takeIf { it > 0 } ?: displayMetrics.widthPixels
        val density = displayMetrics.density
        val adWidth = (adWidthPixels / density).toInt().coerceAtLeast(320)
        return AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, adWidth)
    }

    private fun isSystemDark(): Boolean =
        (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private fun updateSystemBars() {
        // Start from the last theme the UI chose; the page corrects it right after it loads.
        applySystemBars(prefs.getBoolean(KEY_DARK_MODE, isSystemDark()))
    }

    private fun applySystemBars(dark: Boolean) {
        // Status bar matches the top bar, navigation bar matches the page background.
        statusSpacer.setBackgroundColor(if (dark) Color.rgb(16, 26, 41) else Color.WHITE)
        navSpacer.setBackgroundColor(if (dark) Color.rgb(9, 17, 30) else Color.rgb(243, 246, 251))
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = !dark
        controller.isAppearanceLightNavigationBars = !dark
    }

    override fun onStart() {
        super.onStart()
        if (::adMobConsentManager.isInitialized && adMobConsentManager.canRequestAds()) {
            appOpenAdManager.showAdIfAvailable(this)
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // Device switched between light/dark: tell the page so "follow device" updates live.
        webView.evaluateJavascript("window.onSystemThemeChanged && window.onSystemThemeChanged()", null)
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun refreshRates() {
            runOnUiThread { fetchRates() }
        }

        @JavascriptInterface
        fun setNotificationsEnabled(enabled: Boolean) {
            prefs.edit().putBoolean(KEY_NOTIFICATIONS, enabled).apply()
            if (enabled) {
                createNotificationChannel()
                runOnUiThread { requestNotificationPermissionIfNeeded() }
                scheduleBackgroundUpdates()
            }
        }

        @JavascriptInterface
        fun setAutoUpdateEnabled(enabled: Boolean) {
            prefs.edit().putBoolean(KEY_AUTO_UPDATE, enabled).apply()
            if (enabled) scheduleBackgroundUpdates() else cancelBackgroundUpdates()
        }

        @JavascriptInterface
        fun setUpdateIntervalMinutes(minutes: Int) {
            val safe = when (minutes) {
                15, 30, 60 -> minutes
                else -> 15
            }
            prefs.edit().putInt(KEY_INTERVAL_MIN, safe).apply()
            if (prefs.getBoolean(KEY_AUTO_UPDATE, true)) scheduleBackgroundUpdates()
        }

        @JavascriptInterface
        fun setSelectedProvince(name: String) {
            prefs.edit().putString(KEY_SELECTED_PROVINCE, name).apply()
        }

        @JavascriptInterface
        fun setFavorites(json: String) {
            prefs.edit().putString(KEY_FAVORITES, json).apply()
        }

        @JavascriptInterface
        fun setQuietHours(enabled: Boolean, start: String, end: String) {
            val validTime = Regex("^(?:[01]\\d|2[0-3]):[0-5]\\d$")
            if (!validTime.matches(start) || !validTime.matches(end) || start == end) return
            prefs.edit().putBoolean("quiet_hours_enabled", enabled).putString("quiet_hours_start", start).putString("quiet_hours_end", end).apply()
        }

        @JavascriptInterface
        fun setTargetAlert(rate: Int, direction: String, province: String) {
            if (rate <= 0 || province.isBlank()) return
            val safeDirection = if (direction == "below") "below" else "above"
            prefs.edit()
                .putInt("target_alert_rate", rate)
                .putString("target_alert_direction", safeDirection)
                .putString("target_alert_province", province)
                .putBoolean("target_alert_enabled", true)
                .apply()
        }

        @JavascriptInterface
        fun areNotificationsAllowed(): Boolean {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return false
            if (!NotificationManagerCompat.from(this@MainActivity).areNotificationsEnabled()) return false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                    .getNotificationChannel(NOTIFICATION_CHANNEL_ID)
                if (channel != null && channel.importance == NotificationManager.IMPORTANCE_NONE) return false
            }
            return true
        }

        @JavascriptInterface
        fun openNotificationSettings() {
            runOnUiThread {
                try {
                    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                        putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                    }
                    startActivity(intent)
                } catch (_: Exception) {
                }
            }
        }

        @JavascriptInterface
        fun requestNotificationPermission() {
            runOnUiThread { requestNotificationPermissionIfNeeded() }
        }

        @JavascriptInterface
        fun setDarkMode(dark: Boolean) {
            prefs.edit().putBoolean(KEY_DARK_MODE, dark).apply()
            runOnUiThread { applySystemBars(dark) }
        }


        @JavascriptInterface
        fun setPrivacyOptionsVisible(visible: Boolean) {
            runOnUiThread {
                webView.evaluateJavascript("window.setPrivacyOptionsVisible && window.setPrivacyOptionsVisible($visible);", null)
            }
        }

        @JavascriptInterface
        fun openPrivacyPolicy() {
            runOnUiThread {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://aehmnazar1234533-bot.github.io/dolary-privacy-policy/")))
                } catch (_: Exception) {
                }
            }
        }

        @JavascriptInterface
        fun openDeveloperWhatsApp() {
            runOnUiThread {
                try {
                    val message = Uri.encode("مرحباً، لدي اقتراح أو طلب تطوير بخصوص تطبيق دولاري.")
                    val whatsappUri = Uri.parse("https://wa.me/9647866606413?text=$message")
                    startActivity(Intent(Intent.ACTION_VIEW, whatsappUri))
                } catch (_: Exception) {
                }
            }
        }

        @JavascriptInterface
        fun showPrivacyOptions() {
            runOnUiThread { adMobConsentManager.showPrivacyOptionsForm() }
        }

        @JavascriptInterface
        fun isSystemDark(): Boolean = this@MainActivity.isSystemDark()
    }

    @Deprecated("Use the notification permission result to refresh the settings hint.")
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 7001 && ::webView.isInitialized && !isFinishing && !isDestroyed) {
            webView.evaluateJavascript(
                "window.refreshNotificationPermissionStatus && window.refreshNotificationPermissionStatus();",
                null
            )
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            prefs.edit().putBoolean(KEY_PERMISSION_ASKED, true).apply()
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7001)
        }
    }

    private fun pushCachedDataToWebView() {
        val cached = prefs.getString(KEY_LAST_JSON, null) ?: return
        val quoted = JSONObject.quote(cached)
        webView.evaluateJavascript("window.setLiveRates($quoted, true, true);", null)
        val history = prefs.getString(KEY_NOTIFICATION_HISTORY, "[]") ?: "[]"
        webView.evaluateJavascript("window.setNativeNotificationHistory(${JSONObject.quote(history)});", null)
    }

    // A newer manual/automatic request always wins; slow older responses cannot overwrite it.
    @Volatile private var latestRatesRequestId = 0

    private fun fetchRates() {
        val requestId = synchronized(ratesRequestLock) {
            latestRatesRequestId += 1
            activeRatesConnection?.disconnect()
            activeRatesConnection = null
            latestRatesRequestId
        }
        progressBar.visibility = View.VISIBLE
        ratesExecutor.execute {
            if (requestId != latestRatesRequestId || isFinishing || isDestroyed) return@execute
            var connection: HttpURLConnection? = null
            try {
                val openedConnection = (URL(RATES_URL).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 10000
                    readTimeout = 12000
                    useCaches = false
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Cache-Control", "no-cache")
                    setRequestProperty("User-Agent", "Dolary Android App/1.4")
                }
                connection = openedConnection
                synchronized(ratesRequestLock) {
                    if (requestId == latestRatesRequestId) activeRatesConnection = openedConnection
                    else openedConnection.disconnect()
                }
                if (requestId != latestRatesRequestId) return@execute

                val code = openedConnection.responseCode
                if (code !in 200..299) throw Exception("HTTP $code")

                val response = BufferedReader(
                    InputStreamReader(openedConnection.inputStream, StandardCharsets.UTF_8)
                ).use { it.readText() }

                val json = JSONObject(response)
                if (!hasUsableRates(json)) throw Exception("لم تصل أسعار صالحة من المصدر")

                mainHandler.post {
                    if (requestId != latestRatesRequestId || isFinishing || isDestroyed) return@post
                    prefs.edit().putString(KEY_LAST_JSON, response).apply()
                    progressBar.visibility = View.GONE
                    webView.evaluateJavascript(
                        "window.setLiveRates(${JSONObject.quote(response)}, false, false);",
                        null
                    )
                }
            } catch (e: Exception) {
                mainHandler.post {
                    if (requestId != latestRatesRequestId || isFinishing || isDestroyed) return@post
                    progressBar.visibility = View.GONE
                    webView.evaluateJavascript(
                        "window.setLiveRatesError(${JSONObject.quote(e.message ?: "Network error")});",
                        null
                    )
                }
            } finally {
                synchronized(ratesRequestLock) {
                    if (activeRatesConnection === connection) activeRatesConnection = null
                }
                connection?.disconnect()
            }
        }
    }

    private fun hasUsableRates(json: JSONObject): Boolean {
        val cities = json.optJSONArray("cities") ?: return false
        for (i in 0 until cities.length()) {
            val city = cities.optJSONObject(i) ?: continue
            val sides = city.optJSONArray("sides")
            if (sides != null) {
                for (j in 0 until sides.length()) {
                    val side = sides.optJSONObject(j) ?: continue
                    if (!side.isNull("side")) continue
                    val value = side.optDouble("usd_iqd_per_100", Double.NaN)
                    if (value.isFinite() && value > 0.0 && value <= Int.MAX_VALUE) return true
                }
            }
            val primary = city.optDouble("usd_iqd_per_100", Double.NaN)
            if (primary.isFinite() && primary > 0.0 && primary <= Int.MAX_VALUE) return true
        }
        return false
    }

    private fun scheduleBackgroundUpdates() {
        if (!prefs.getBoolean(KEY_AUTO_UPDATE, true)) return
        RateWorker.schedule(applicationContext, prefs.getInt(KEY_INTERVAL_MIN, 15))
    }

    private fun cancelBackgroundUpdates() {
        RateWorker.cancel(applicationContext)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            "تغيّرات سعر الدولار",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "تنبيهات عند تغيّر سعر الدولار في المحافظات المفضلة"
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    override fun onResume() {
        super.onResume()
        adView?.resume()
        if (::webView.isInitialized) {
            scheduleBackgroundUpdates()
            webView.evaluateJavascript(
                "window.refreshNotificationPermissionStatus && window.refreshNotificationPermissionStatus();",
                null
            )
        }
    }

    override fun onPause() {
        adView?.pause()
        super.onPause()
    }

    override fun onDestroy() {
        synchronized(ratesRequestLock) {
            latestRatesRequestId += 1
            activeRatesConnection?.disconnect()
            activeRatesConnection = null
        }
        ratesExecutor.shutdownNow()
        adView?.destroy()
        mainHandler.removeCallbacksAndMessages(null)
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("AndroidBridge")
            webView.destroy()
        }
        super.onDestroy()
    }
}
