plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

val stashUrl: String = (findProperty("stashUrl") as String?)?.takeIf { it.isNotBlank() }
    ?: "https://your-stash.example.com"

android {
    namespace = "app.stash.twa"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.stash.twa"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "STASH_URL", "\"$stashUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.browser)
}