package org.omicron.mobile.feature.discovery

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.timeline_untitled
import org.jetbrains.compose.resources.stringResource
import zed.rainxch.rikkaui.foundation.RikkaTheme

const val DISCOVERY_POST_TYPE = "discovery-post"
const val DISCOVERY_PERSON_TYPE = "discovery-person"
const val DISCOVERY_TAG_TYPE = "discovery-tag"
const val DISCOVERY_SECTION_TYPE = "discovery-section"

@Composable
internal fun DiscoveryPostRow(
    post: Post,
    onOpen: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = post.author.displayName,
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = post.title?.ifBlank { null } ?: stringResource(Res.string.timeline_untitled),
            variant = TextVariant.H3,
            color = OmicronTheme.colors.foreground,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DiscoveryCount(icon = RikkaIcons.Heart, count = post.likeCount.toString())
            DiscoveryCount(icon = RikkaIcons.MessageCircle, count = post.commentCount.toString())
            DiscoveryCount(icon = RikkaIcons.Repeat, count = post.recommendCount.toString())
        }
    }
}

@Composable
internal fun DiscoveryAvatar(
    displayName: String,
    avatarUrl: String?,
) {
    val shape = RikkaTheme.shapes.full
    Box(
        modifier =
            Modifier
                .size(36.dp)
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
                modifier = Modifier.size(36.dp).clip(shape),
            )
        }
    }
}

@Composable
private fun DiscoveryCount(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: String,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Sm)
        Text(text = count, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 1)
    }
}
