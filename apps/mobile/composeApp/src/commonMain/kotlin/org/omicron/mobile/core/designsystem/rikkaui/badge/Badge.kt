package org.omicron.mobile.core.designsystem.rikkaui.badge

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun Badge(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier = modifier.clip(RikkaTheme.shapes.full).background(RikkaTheme.colors.muted).padding(horizontal = 10.dp, vertical = 4.dp)) {
        content()
    }
}
