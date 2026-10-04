package com.hukang.local
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ) {
            override fun getLaunchOptions(): Bundle? {
              // Only the isolated cloud Debug APK accepts the regression-test intent.
              if (!BuildConfig.IS_CLOUD_DEBUG) return null
              val storagePhase = this@MainActivity.intent.getStringExtra("storagePhase")
              val storageRunId = this@MainActivity.intent.getStringExtra("storageRunId")
              if ((storagePhase == "write" || storagePhase == "verify") &&
                  storageRunId != null && Regex("^[A-Za-z0-9][A-Za-z0-9_-]{5,79}$").matches(storageRunId)) {
                return Bundle().apply {
                  putString("storagePhase", storagePhase)
                  putString("storageRunId", storageRunId)
                }
              }
              if (!this@MainActivity.intent.getBooleanExtra("ocrBenchmark", false)) return null
              return Bundle().apply {
                putBoolean("ocrBenchmark", true)
                putString("ocrRunId", this@MainActivity.intent.getStringExtra("ocrRunId") ?: "local-ocr")
              }
            }
          })
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
