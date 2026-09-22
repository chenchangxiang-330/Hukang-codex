package com.hukang.local
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
class HuKangOcrPackage:ReactPackage{override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(HuKangOcrModule(context));override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()}
