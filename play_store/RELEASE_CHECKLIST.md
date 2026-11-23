# خطوات النشر على Google Play

## 1) جهّز المشروع (مرة وحدة)
1. غيّر `YOUR_EMAIL@example.com` في privacy_policy.html وارفعها كصفحة عامة (GitHub Pages مثلاً).
2. (اختياري) غيّر `applicationId` و`namespace` من `com.dolary.app` لاسمك قبل أول رفع. بعد النشر ما يتغير.
3. أنشئ مفتاح التوقيع **واحتفظ بنسخة احتياطية منه، لو ضاع ما تقدر تحدّث التطبيق:**
   keytool -genkeypair -v -keystore dolary-release.jks -alias dolary -keyalg RSA -keysize 2048 -validity 10000
4. انسخ `keystore.properties.example` إلى `keystore.properties` واكتب كلمات السر.

## 2) ابنِ ملف النشر (يحتاج JDK 17 وAndroid SDK 36)
   ./gradlew bundleRelease
الناتج: app/build/outputs/bundle/release/app-release.aab ← هذا اللي ترفعه.
قبل الرفع جرّب `./gradlew assembleRelease` وثبّته على جهاز فعلي (أندرويد 13+ وإذا أمكن 16) وتأكد إن الأسعار والإشعارات وزر الرجوع شغالين بعد التصغير (R8).

## 3) Play Console
- صفحة المتجر: انسخ من store_listing.md، الأيقونة graphics/icon_512.png، الصورة graphics/feature_graphic_1024x500.png، ولقطتا شاشة على الأقل (صوّرهن من جهازك).
- App content: سياسة الخصوصية (الرابط)، الإعلانات = نعم (التطبيق يضم Google AdMob)، تصنيف المحتوى (استبيان)، الفئة المستهدفة = 13+/بالغين، Financial features declaration = لا خدمات مالية (عرض معلومات فقط)، Data safety.
- Data safety: لا تفترض أن التطبيق لا يعالج بيانات. مكتبات AdMob/UMP قد تعالج عنوان IP ومعرّفات الجهاز أو الإعلانات وبيانات التفاعل والتشخيص، ومصدر الأسعار قد يرى IP وبيانات الطلب التقنية. راجع إفصاحات SDK الحالية واملأ النموذج حسب السلوك الفعلي.
- حساب شخصي جديد: closed test بـ 12 مختبر لمدة 14 يوم متواصلة قبل طلب الإنتاج.
