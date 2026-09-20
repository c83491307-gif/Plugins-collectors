plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.creazzy.universalai"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.creazzy.universalai"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "DEFAULT_BASE_URL", "\"" + (project.findProperty("CREAZZY_BASE_URL") ?: "") + "\"")
        buildConfigField("String", "SCANDIT_LICENSE_KEY", "\"" + (project.findProperty("SCANDIT_LICENSE_KEY") ?: "") + "\"")
    }

    compileOptions {\n        sourceCompatibility = JavaVersion.VERSION_17\n        targetCompatibility = JavaVersion.VERSION_17\n    }\n\n    kotlinOptions {\n        jvmTarget = "17"\n    }\n\n    buildFeatures { buildConfig = true }
    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.scandit.datacapture:core:8.6.0")
    implementation("com.scandit.datacapture:barcode:8.6.0")
}
