package org.omicron.mobile.core.designsystem.rikkaui.card

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val shape = RikkaTheme.shapes.lg
    Column(
        modifier = modifier.clip(shape).background(RikkaTheme.colors.surface).border(1.dp, RikkaTheme.colors.border, shape),
        content = content,
    )
}
