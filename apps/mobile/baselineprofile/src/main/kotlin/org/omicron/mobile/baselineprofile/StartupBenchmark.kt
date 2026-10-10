package org.omicron.mobile.baselineprofile

import android.os.ParcelFileDescriptor
import androidx.benchmark.macro.ExperimentalMacrobenchmarkApi
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule
    val rule = MacrobenchmarkRule()

    @OptIn(ExperimentalMacrobenchmarkApi::class)
    @Test
    fun coldStartupWithBaselineProfile() {
        prepareBaselineProfile()
        rule.measureRepeated(
            packageName = "org.omicron.mobile.baselineprofile",
            metrics = listOf(StartupTimingMetric()),
            compilationMode = CompilationMode.Ignore(),
            iterations = 5,
            startupMode = StartupMode.COLD,
            setupBlock = { pressHome() },
        ) {
            startActivityAndWait()
        }
    }

    private fun prepareBaselineProfile() {
        val packageName = "org.omicron.mobile.baselineprofile"
        val uiAutomation = InstrumentationRegistry.getInstrumentation().uiAutomation
        fun execute(command: String): String =
            ParcelFileDescriptor.AutoCloseInputStream(uiAutomation.executeShellCommand(command))
                .bufferedReader()
                .use { it.readText() }

        execute("am start -n $packageName/org.omicron.mobile.MainActivity")
        val installResult =
            execute(
                "am broadcast -a androidx.profileinstaller.action.INSTALL_PROFILE " +
                    "-n $packageName/androidx.profileinstaller.ProfileInstallReceiver",
            )
        check(Regex("result=(1|2)\\b").containsMatchIn(installResult)) {
            "Baseline profile installation failed: $installResult"
        }

        val compileResult = execute("cmd package compile -f -m speed-profile $packageName")
        check(compileResult.contains("Success") || compileResult.contains("PERFORMED")) {
            "Baseline profile compilation failed: $compileResult"
        }
    }
}
