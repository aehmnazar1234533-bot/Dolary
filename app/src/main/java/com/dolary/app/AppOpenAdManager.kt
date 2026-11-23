package com.dolary.app

import android.app.Activity
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.appopen.AppOpenAd

/** Handles the AdMob App Open ad without blocking the app when an ad is unavailable. */
class AppOpenAdManager {

    companion object {
        private const val AD_UNIT_ID = "ca-app-pub-9157735624204920/7580078208"
    }

    private var appOpenAd: AppOpenAd? = null
    private var isLoading = false
    private var isShowing = false

    fun loadAd(activity: Activity) {
        if (isLoading || appOpenAd != null) return

        isLoading = true
        val request = AdRequest.Builder().build()
        AppOpenAd.load(
            activity,
            AD_UNIT_ID,
            request,
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

    fun showAdIfAvailable(activity: Activity, onFinished: () -> Unit = {}) {
        val ad = appOpenAd
        if (ad == null || isShowing) {
            loadAd(activity)
            onFinished()
            return
        }

        isShowing = true
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
                loadAd(activity)
                onFinished()
            }
        }
        ad.show(activity)
    }
}
