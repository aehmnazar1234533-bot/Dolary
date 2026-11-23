# JavaScript bridge used by the WebView UI: R8 must not rename/remove these methods.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations
-keepclassmembers class com.dolary.app.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.dolary.app.RateWorker { *; }
