package org.omicron.mobile.feature.connect

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.input.Input
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.connect_change_instance
import org.omicron.mobile.resources.connect_connected_description
import org.omicron.mobile.resources.connect_connected_title
import org.omicron.mobile.resources.connect_continue
import org.omicron.mobile.resources.connect_error_invalid_address
import org.omicron.mobile.resources.connect_error_unreachable
import org.omicron.mobile.resources.connect_instance_address
import org.omicron.mobile.resources.connect_instance_description
import org.omicron.mobile.resources.connect_instance_placeholder
import org.omicron.mobile.resources.connect_loading
import org.omicron.mobile.resources.connect_logo_description
import org.omicron.mobile.resources.connect_title
import org.omicron.mobile.resources.connect_try_again
import org.omicron.mobile.resources.omicron_logo
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun ConnectRoute(
    viewModel: ConnectViewModel,
    onContinue: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    ConnectScreen(
        state = state,
        onOriginChange = viewModel::updateOrigin,
        onConnect = viewModel::connect,
        onChangeInstance = viewModel::changeInstance,
        onContinue = onContinue,
    )
}

@Composable
private fun ConnectScreen(
    state: ConnectUiState,
    onOriginChange: (String) -> Unit,
    onConnect: () -> Unit,
    onChangeInstance: () -> Unit,
    onContinue: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize().background(RikkaTheme.colors.background).safeDrawingPadding(),
        contentAlignment = Alignment.Center,
    ) {
        if (state.isRestoring) {
            Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.connect_loading))
        } else {
            Column(
                modifier = Modifier.fillMaxWidth().widthIn(max = 480.dp).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Image(
                    painter = painterResource(Res.drawable.omicron_logo),
                    contentDescription = stringResource(Res.string.connect_logo_description),
                    modifier = Modifier.size(80.dp).align(Alignment.CenterHorizontally),
                )
                when (val phase = state.phase) {
                    is ConnectPhase.Connected -> ConnectedInstance(
                        instance = phase.instance,
                        onChangeInstance = onChangeInstance,
                        onContinue = onContinue,
                    )

                    else -> ConnectForm(
                        state = state,
                        onOriginChange = onOriginChange,
                        onConnect = onConnect,
                    )
                }
            }
        }
    }
}

@Composable
private fun ConnectForm(
    state: ConnectUiState,
    onOriginChange: (String) -> Unit,
    onConnect: () -> Unit,
) {
    val error = (state.phase as? ConnectPhase.Error)?.error
    val errorText =
        when (error) {
            ConnectError.InvalidAddress -> stringResource(Res.string.connect_error_invalid_address)
            ConnectError.Unreachable -> stringResource(Res.string.connect_error_unreachable)
            null -> null
        }

    Text(text = stringResource(Res.string.connect_title), variant = TextVariant.H2)
    Text(text = stringResource(Res.string.connect_instance_description), variant = TextVariant.Lead)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = stringResource(Res.string.connect_instance_address), variant = TextVariant.Small)
        Input(
            value = state.origin,
            onValueChange = onOriginChange,
            placeholder = stringResource(Res.string.connect_instance_placeholder),
            label = stringResource(Res.string.connect_instance_address),
            isError = error != null,
            errorMessage = errorText.orEmpty(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onConnect() }),
        )
        if (errorText != null) {
            Text(text = errorText, variant = TextVariant.Small, color = RikkaTheme.colors.destructive)
        }
    }
    Button(
        text = stringResource(if (error == null) Res.string.connect_continue else Res.string.connect_try_again),
        onClick = onConnect,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
        loading = state.phase is ConnectPhase.Connecting,
    )
}

@Composable
private fun ConnectedInstance(
    instance: InstanceConfiguration,
    onChangeInstance: () -> Unit,
    onContinue: () -> Unit,
) {
    Text(
        text = stringResource(Res.string.connect_connected_title, instance.name),
        variant = TextVariant.H2,
    )
    Text(text = instance.domain, variant = TextVariant.Lead)
    Text(text = stringResource(Res.string.connect_connected_description), variant = TextVariant.P)
    Button(
        text = stringResource(Res.string.connect_continue),
        onClick = onContinue,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
    )
    Button(
        text = stringResource(Res.string.connect_change_instance),
        onClick = onChangeInstance,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
    )
}
