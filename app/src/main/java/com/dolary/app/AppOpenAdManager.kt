package com.dolary.app

import android.app.Activity
import android.content.SharedPreferences
import android.os.SystemClock
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.appopen.AppOpenAd

/** Handles App Open ads with a foreground-return gate and a persisted frequency cap. */
class AppOpenAdManager(private val prefs: SharedPreferences) {

    companion object {
        private const val AD_UNIT_ID = "ca-app-pub-9157735624204920/7580078208"
        private const val MIN_BACKGROUND_DURATION_MS = 30_000L
        private const val MIN_TIME_BETWEEN_ADS_MS = 4 * 60 * 60 * 1000L
        private const val KEY_LAST_AD_SHOWN_AT = "app_open_ad_last_shown_at"
    }

    private var appOpenAd: AppOpenAd? = null
    private var isLoading = false
    private var isShowing = false
    private var backgroundedAtElapsedMs: Long? = null

    fun onAppBackgrounded() {
        backgroundedAtElapsedMs = SystemClock.elapsedRealtime()
    }

    fun loadAd(activity: Activity) {
        if (isLoading || appOpenAd != null || activity.isFinishing || activity.isDestroyed) return

        isLoading = true
        AppOpenAd.load(
            activity,
            AD_UNIT_ID,
            AdRequest.Builder().build(),
            object : AppOpenAd.AppOpenAdLoadCallback() {
                override fun onAdLoaded(ad: AppOpenAd) {
                    isLoading = false
                    appOpenAd = ad
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    isLoading = false
                    appOpenAd = null
                }
            }
        )
    }

    /** Call on Activity.onStart; first launch and quick returns never trigger an ad. */
    fun showAdIfAvailable(activity: Activity, onFinished: () -> Unit = {}) {
        val elapsedNow = SystemClock.elapsedRealtime()
        val backgroundDuration = backgroundedAtElapsedMs?.let { elapsedNow - it } ?: 0L
        backgroundedAtElapsedMs = null
        val wallNow = System.currentTimeMillis()
        val lastShown = prefs.getLong(KEY_LAST_AD_SHOWN_AT, 0L)

        if (backgroundDuration < MIN_BACKGROUND_DURATION_MS ||
            (lastShown > 0L && wallNow - lastShown < MIN_TIME_BETWEEN_ADS_MS) ||
            activity.isFinishing || activity.isDestroyed
        ) {
            loadAd(activity)
            onFinished()
            return
        }

        val ad = appOpenAd
        if (ad == null || isShowing) {
            loadAd(activity)
            onFinished()
            return
        }

        isShowing = true
        prefs.edit().putLong(KEY_LAST_AD_SHOWN_AT, wallNow).apply()
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                appOpenAd = null
                isShowing = false
                loadAd(activity)
                onFinished()
            }

            override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                appOpenAd = null
                isShowing = false
                prefs.edit().putLong(KEY_LAST_AD_SHOWN_AT, lastShown).apply()
                loadAd(activity)
                onFinished()
            }
        }
        try {
            ad.show(activity)
        } catch (_: Exception) {
            appOpenAd = null
            isShowing = false
            prefs.edit().putLong(KEY_LAST_AD_SHOWN_AT, lastShown).apply()
            loadAd(activity)
            onFinished()
        }
    }
}
