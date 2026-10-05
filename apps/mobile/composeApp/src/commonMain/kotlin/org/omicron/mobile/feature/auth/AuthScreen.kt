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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.auth_error_missing_instance
import org.omicron.mobile.resources.auth_error_unavailable
import org.omicron.mobile.resources.auth_restoring
import org.omicron.mobile.resources.auth_session_not_found_description
import org.omicron.mobile.resources.auth_session_not_found_title
import org.omicron.mobile.resources.auth_signed_in_description
import org.omicron.mobile.resources.auth_signed_in_title
import org.omicron.mobile.resources.auth_try_again
import org.omicron.mobile.resources.connect_change_instance
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun AuthRoute(
    viewModel: AuthViewModel,
    onChangeInstance: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    AuthScreen(
        state = state,
        onRetry = viewModel::restore,
        onChangeInstance = onChangeInstance,
    )
}

@Composable
private fun AuthScreen(
    state: AuthUiState,
    onRetry: () -> Unit,
    onChangeInstance: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize().background(RikkaTheme.colors.background).safeDrawingPadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().widthIn(max = 480.dp).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            when (val phase = state.phase) {
                AuthPhase.Restoring -> Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.auth_restoring))
                is AuthPhase.SignedIn -> SignedIn(phase.user.displayName, phase.instance.name, onChangeInstance)
                is AuthPhase.SignedOut -> SignedOut(phase.instance.name, onChangeInstance)
                is AuthPhase.Error -> AuthError(phase.error, onRetry, onChangeInstance)
            }
        }
    }
}

@Composable
private fun SignedIn(
    displayName: String,
    instanceName: String,
    onChangeInstance: () -> Unit,
) {
    Text(text = stringResource(Res.string.auth_signed_in_title), variant = TextVariant.H2)
    Text(text = stringResource(Res.string.auth_signed_in_description, displayName, instanceName), variant = TextVariant.P)
    ChangeInstanceButton(onChangeInstance)
}

@Composable
private fun SignedOut(
    instanceName: String,
    onChangeInstance: () -> Unit,
) {
    Text(text = stringResource(Res.string.auth_session_not_found_title), variant = TextVariant.H2)
    Text(text = stringResource(Res.string.auth_session_not_found_description, instanceName), variant = TextVariant.P)
    ChangeInstanceButton(onChangeInstance)
}

@Composable
private fun AuthError(
    error: AuthError,
    onRetry: () -> Unit,
    onChangeInstance: () -> Unit,
) {
    Text(
        text =
            stringResource(
                if (error == AuthError.MissingInstance) {
                    Res.string.auth_error_missing_instance
                } else {
                    Res.string.auth_error_unavailable
                },
            ),
        variant = TextVariant.H2,
    )
    Button(
        text = stringResource(Res.string.auth_try_again),
        onClick = onRetry,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
    )
    ChangeInstanceButton(onChangeInstance)
}

@Composable
private fun ChangeInstanceButton(onClick: () -> Unit) {
    Button(
        text = stringResource(Res.string.connect_change_instance),
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
    )
}
