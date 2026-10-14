package org.omicron.mobile.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.CenteredLoadingState
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.auth_error_unavailable
import org.omicron.mobile.resources.auth_restoring
import org.omicron.mobile.resources.auth_try_again
import org.omicron.mobile.resources.connect_change_instance
import org.omicron.mobile.resources.startup_continue_as_guest
import org.omicron.mobile.resources.startup_error_unavailable

@Composable
fun StartupScreen(
    phase: StartupPhase,
    onRetry: () -> Unit,
    onContinueAsGuest: () -> Unit,
    onChooseInstance: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
        contentAlignment = Alignment.Center,
    ) {
        when (phase) {
            StartupPhase.Restoring -> CenteredLoadingState(message = stringResource(Res.string.auth_restoring))
            is StartupPhase.Error -> Column(
                modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Text(
                    text = stringResource(if (phase.hasSavedInstance) Res.string.auth_error_unavailable else Res.string.startup_error_unavailable),
                    variant = TextVariant.H2,
                )
                Button(
                    text = stringResource(Res.string.auth_try_again),
                    onClick = onRetry,
                    modifier = Modifier.fillMaxWidth(),
                    size = ButtonSize.Lg,
                )
                if (phase.hasSavedInstance) {
                    Button(
                        text = stringResource(Res.string.startup_continue_as_guest),
                        onClick = onContinueAsGuest,
                        modifier = Modifier.fillMaxWidth(),
                        size = ButtonSize.Lg,
                        variant = ButtonVariant.Outline,
                    )
                }
                Button(
                    text = stringResource(Res.string.connect_change_instance),
                    onClick = onChooseInstance,
                    modifier = Modifier.fillMaxWidth(),
                    size = ButtonSize.Lg,
                    variant = ButtonVariant.Outline,
                )
            }
            is StartupPhase.Ready -> Unit
        }
    }
}
