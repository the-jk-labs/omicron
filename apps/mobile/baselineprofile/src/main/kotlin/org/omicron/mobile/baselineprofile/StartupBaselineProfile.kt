package org.omicron.mobile.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StartupBaselineProfile {
    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun collectStartupProfile() {
        rule.collect(
            packageName = "org.omicron.mobile.baselineprofile",
            maxIterations = 10,
            stableIterations = 2,
            includeInStartupProfile = true,
        ) {
            pressHome()
            startActivityAndWait()
        }
    }
}
