package org.omicron.mobile.core.designsystem.rikkaui.tabs

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun TabList(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Row(
        modifier = modifier.selectableGroup().semantics { isTraversalGroup = true },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        content()
    }
}

@Composable
fun Tab(selected: Boolean, onClick: () -> Unit, text: String, modifier: Modifier = Modifier) {
    val bringIntoViewRequester = remember { BringIntoViewRequester() }
    LaunchedEffect(selected) {
        if (selected) bringIntoViewRequester.bringIntoView()
    }
    val color by animateColorAsState(if (selected) RikkaTheme.colors.onBackground else RikkaTheme.colors.onMuted)
    val indicatorColor = RikkaTheme.colors.onBackground
    Box(
        modifier =
            modifier
                .heightIn(min = 48.dp)
                .bringIntoViewRequester(bringIntoViewRequester)
                .selectable(selected = selected, onClick = onClick, role = Role.Tab)
                .drawBehind {
                    if (selected) {
                        val stroke = 2.dp.toPx()
                        drawLine(indicatorColor, Offset(0f, size.height - stroke / 2), Offset(size.width, size.height - stroke / 2), stroke)
                    }
                }
                .padding(horizontal = 8.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            variant = TextVariant.Small,
            color = color,
            maxLines = 1,
            style = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
        )
    }
}
