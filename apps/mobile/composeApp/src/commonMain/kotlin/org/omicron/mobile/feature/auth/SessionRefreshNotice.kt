package org.omicron.mobile.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.data.repository.SessionRefreshState
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.auth_try_again
import org.omicron.mobile.resources.home_session_refreshing
import org.omicron.mobile.resources.home_session_refresh_error

@Composable
fun SessionRefreshNotice(state: SessionRefreshState, onRetry: () -> Unit) {
    val refreshing = state == SessionRefreshState.Restoring
    val message = stringResource(if (refreshing) Res.string.home_session_refreshing else Res.string.home_session_refresh_error)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (refreshing) Spinner(size = SpinnerSize.Sm, label = message)
        Text(text = message, variant = TextVariant.Small, modifier = Modifier.weight(1f))
        if (!refreshing) Button(
            text = stringResource(Res.string.auth_try_again), onClick = onRetry,
            modifier = Modifier.heightIn(min = 48.dp), variant = ButtonVariant.Ghost, size = ButtonSize.Sm,
        )
    }
}
