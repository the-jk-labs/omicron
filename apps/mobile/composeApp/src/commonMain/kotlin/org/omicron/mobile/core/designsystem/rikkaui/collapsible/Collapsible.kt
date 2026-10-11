package org.omicron.mobile.core.designsystem.rikkaui.collapsible

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import zed.rainxch.rikkaui.foundation.RikkaTheme
import zed.rainxch.rikkaui.foundation.modifier.minTouchTarget

@Composable
fun Collapsible(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier = modifier) { content() }
}

@Composable
fun CollapsibleTrigger(
    onClick: () -> Unit,
    label: String,
    expanded: Boolean,
    expandedLabel: String,
    collapsedLabel: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier =
            modifier.minTouchTarget().clickable(role = Role.Button, onClick = onClick).semantics(
                mergeDescendants = true,
            ) {
                contentDescription = label
                stateDescription = if (expanded) expandedLabel else collapsedLabel
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        content()
    }
}

@Composable
fun CollapsibleContent(
    open: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val duration = RikkaTheme.motion.durationDefault
    AnimatedVisibility(
        visible = open,
        enter =
            expandVertically(tween(duration), expandFrom = Alignment.Top) + fadeIn(tween(duration)),
        exit =
            shrinkVertically(tween(duration), shrinkTowards = Alignment.Top) +
                fadeOut(tween(duration)),
    ) {
        Box(modifier.fillMaxWidth()) { content() }
    }
}
