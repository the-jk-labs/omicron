package org.omicron.mobile.core.designsystem.rikkaui.separator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun Separator(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxWidth().height(1.dp).background(RikkaTheme.colors.border).clearAndSetSemantics {})
}
