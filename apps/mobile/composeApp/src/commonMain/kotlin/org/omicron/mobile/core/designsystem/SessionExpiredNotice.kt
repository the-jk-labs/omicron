package org.omicron.mobile.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.timeline_sign_in
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun SessionExpiredNotice(
    message: String,
    onSignIn: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().background(RikkaTheme.colors.muted).padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = message, modifier = Modifier.weight(1f), variant = TextVariant.Small)
        Button(
            text = stringResource(Res.string.timeline_sign_in),
            onClick = onSignIn,
            size = ButtonSize.Default,
            variant = ButtonVariant.Outline,
        )
    }
}
