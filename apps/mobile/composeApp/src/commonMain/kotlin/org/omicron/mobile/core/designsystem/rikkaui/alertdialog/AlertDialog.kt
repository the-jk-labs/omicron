package org.omicron.mobile.core.designsystem.rikkaui.alertdialog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import zed.rainxch.rikkaui.foundation.LocalContentColor
import zed.rainxch.rikkaui.foundation.LocalTextStyle
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun AlertDialog(open: Boolean, onDismiss: () -> Unit, label: String, content: @Composable () -> Unit) {
    if (!open) return
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(dismissOnClickOutside = false, usePlatformDefaultWidth = false),
    ) {
        val shape = RikkaTheme.shapes.lg
        Column(
            modifier = Modifier.padding(24.dp).widthIn(max = 520.dp).fillMaxWidth()
                .semantics { paneTitle = label }
                .shadow(RikkaTheme.elevation.high, shape)
                .clip(shape)
                .background(RikkaTheme.colors.surface)
                .border(1.dp, RikkaTheme.colors.border, shape)
                .padding(RikkaTheme.spacing.xl),
            verticalArrangement = Arrangement.spacedBy(RikkaTheme.spacing.md),
        ) {
            CompositionLocalProvider(
                LocalContentColor provides RikkaTheme.colors.onSurface,
                LocalTextStyle provides RikkaTheme.typography.p,
            ) { content() }
        }
    }
}

@Composable
fun AlertDialogHeader(title: String, description: String) {
    Column(verticalArrangement = Arrangement.spacedBy(RikkaTheme.spacing.xs)) {
        Text(text = title, modifier = Modifier.semantics { heading() }, variant = TextVariant.Large)
        Text(text = description, variant = TextVariant.Muted)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AlertDialogFooter(content: @Composable () -> Unit) {
    FlowRow(
        modifier = Modifier.fillMaxWidth().padding(top = RikkaTheme.spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(RikkaTheme.spacing.sm),
        verticalArrangement = Arrangement.spacedBy(RikkaTheme.spacing.sm),
    ) { content() }
}

@Composable
fun AlertDialogCancel(text: String, onClick: () -> Unit) {
    Button(text = text, onClick = onClick, modifier = Modifier.heightIn(min = 48.dp), variant = ButtonVariant.Outline)
}

@Composable
fun AlertDialogAction(text: String, onClick: () -> Unit) {
    Button(text = text, onClick = onClick, modifier = Modifier.heightIn(min = 48.dp), variant = ButtonVariant.Default)
}
