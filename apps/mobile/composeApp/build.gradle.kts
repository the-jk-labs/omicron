import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.baselineprofile)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.compose.components.resources)
            implementation(libs.compose.foundation)
            implementation(libs.compose.runtime)
            implementation(libs.compose.ui)
            implementation(libs.compose.ui.tooling.preview)
            implementation(libs.androidx.navigation.compose)
            implementation(libs.coil.compose)
            implementation(libs.coil.network.ktor3)
            implementation(libs.ksoup)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.serialization.kotlinx.json)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.datetime)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.rikka.icons.core)
            implementation(libs.rikka.icons.lucide)
            implementation(libs.rikka.icons.tokens.core)
            implementation(libs.rikka.ui.foundation)
            implementation(libs.snipme.highlights)
        }

        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.ktor.client.mock)
            implementation(libs.kotlinx.coroutines.test)
        }

        androidMain.dependencies {
            implementation(libs.androidx.activity.compose)
            implementation(libs.androidx.core.ktx)
            implementation(libs.androidx.profileinstaller)
            implementation(libs.ktor.client.okhttp)
        }

        androidInstrumentedTest.dependencies {
            implementation(libs.androidx.compose.ui.test.junit4)
            implementation(libs.androidx.test.junit)
            implementation(libs.androidx.test.runner)
            implementation(libs.ktor.client.mock)
        }
    }
}

android {
    namespace = "org.omicron.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.omicron.mobile"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        compose = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
}

afterEvaluate {
    android.buildTypes.getByName("benchmarkRelease").applicationIdSuffix = ".baselineprofile"
    android.buildTypes.getByName("nonMinifiedRelease").applicationIdSuffix = ".baselineprofile"
}

dependencies {
    baselineProfile(project(":baselineprofile"))
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}

compose.resources {
    packageOfResClass = "org.omicron.mobile.resources"
}
