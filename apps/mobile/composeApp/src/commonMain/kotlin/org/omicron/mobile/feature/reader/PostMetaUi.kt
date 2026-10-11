package org.omicron.mobile.feature.reader

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.PostTag
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
internal fun AuthorAvatar(
    displayName: String,
    avatarUrl: String?,
    size: Dp,
) {
    val shape = RikkaTheme.shapes.full
    Box(
        modifier =
            Modifier
                .size(size)
                .clip(shape)
                .background(RikkaTheme.colors.muted)
                .border(1.dp, OmicronTheme.colors.borderCard, shape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = displayName.trim().firstOrNull()?.uppercase() ?: "?",
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
        )
        avatarUrl?.let { url ->
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size).clip(shape),
            )
        }
    }
}

@Composable
internal fun MetaLabel(
    icon: ImageVector,
    label: String,
    tint: Color,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, size = IconSize.Xs)
        Text(
            text = label,
            variant = TextVariant.Small,
            color = tint,
            maxLines = 1,
        )
    }
}

@Composable
internal fun MetaSeparator() {
    Spacer(
        modifier =
            Modifier
                .width(1.dp)
                .height(12.dp)
                .background(OmicronTheme.colors.borderCard),
    )
}

@Composable
internal fun PostMetaAction(
    imageVector: ImageVector,
    label: String,
    count: Int? = null,
    selected: Boolean?,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val tint = if (selected == true) OmicronTheme.colors.foreground else OmicronTheme.colors.mutedForeground
    val actionModifier =
        if (selected == null) {
            Modifier.semantics(mergeDescendants = true) {
                role = Role.Button
                contentDescription = label
                if (!enabled) disabled()
            }.clickable(enabled = enabled, role = Role.Button, onClick = onClick)
        } else {
            Modifier.semantics(mergeDescendants = true) {
                contentDescription = label
            }.selectable(selected = selected, enabled = enabled, role = Role.Button, onClick = onClick)
        }
    Row(
        modifier =
            Modifier
                .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                .clip(RikkaTheme.shapes.full)
                .alpha(if (enabled) 1f else 0.38f)
                .then(actionModifier)
                .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = imageVector, contentDescription = null, tint = tint, size = IconSize.Xs)
        count?.let { Text(text = it.toString(), variant = TextVariant.Small, color = tint, maxLines = 1) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TagPills(
    tags: List<PostTag>,
    onOpenTag: (String) -> Unit,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        tags.forEach { tag ->
            Box(
                modifier = Modifier.heightIn(min = 48.dp).clickable(role = Role.Button) { onOpenTag(tag.slug) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "#${tag.name}",
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.foregroundAlt,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
                    modifier =
                        Modifier
                            .clip(RikkaTheme.shapes.full)
                            .background(RikkaTheme.colors.muted)
                            .padding(horizontal = 12.dp, vertical = 4.dp),
                )
            }
        }
    }
}
