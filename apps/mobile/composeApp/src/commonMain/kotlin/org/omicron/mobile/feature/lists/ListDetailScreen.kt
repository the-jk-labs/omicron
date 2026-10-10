package org.omicron.mobile.feature.lists

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.article.postPreview
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.feature.common.MobileFeatureError
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.list_detail_empty
import org.omicron.mobile.resources.list_detail_error_missing_instance
import org.omicron.mobile.resources.list_detail_error_offline
import org.omicron.mobile.resources.list_detail_error_server
import org.omicron.mobile.resources.list_detail_load_more
import org.omicron.mobile.resources.list_detail_loading
import org.omicron.mobile.resources.list_detail_loading_more
import org.omicron.mobile.resources.list_detail_retry
import org.omicron.mobile.resources.lists_item_count_many
import org.omicron.mobile.resources.lists_item_count_one
import org.omicron.mobile.resources.timeline_untitled
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun ListDetailRoute(
    viewModel: ListDetailViewModel,
    onOpenPost: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    ListDetailScreen(
        state = state,
        onOpenPost = onOpenPost,
        onRetry = viewModel::retry,
        onLoadMore = viewModel::loadMore,
    )
}

@Composable
private fun ListDetailScreen(
    state: ListDetailUiState,
    onOpenPost: (String) -> Unit,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
) {
    when (state.phase) {
        ListDetailPhase.Loading ->
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.list_detail_loading))
            }
        ListDetailPhase.Error -> ListDetailError(state.error ?: MobileFeatureError.Server, onRetry)
        ListDetailPhase.Empty ->
            Column(modifier = Modifier.fillMaxSize().padding(top = 18.dp)) {
                ListHeader(state)
                Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(Res.string.list_detail_empty), variant = TextVariant.P, color = OmicronTheme.colors.mutedForeground)
                }
            }
        ListDetailPhase.Content ->
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 20.dp),
            ) {
                item(key = "list-header", contentType = "list-header") { ListHeader(state) }
                items(state.posts, key = Post::id, contentType = { "list-post" }) { post ->
                    ListPostRow(post = post, onClick = { onOpenPost(post.id) })
                }
                if (state.nextCursor != null) {
                    item(key = "load-more", contentType = "load-more") {
                        Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                            if (state.isLoadingMore) {
                                Spinner(size = SpinnerSize.Sm, label = stringResource(Res.string.list_detail_loading_more))
                            } else {
                                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    state.loadMoreError?.let {
                                        Text(text = stringResource(errorMessage(it)), variant = TextVariant.Small, color = OmicronTheme.colors.destructive)
                                    }
                                    Button(
                                        text = stringResource(Res.string.list_detail_load_more),
                                        onClick = onLoadMore,
                                        variant = ButtonVariant.Outline,
                                        size = ButtonSize.Lg,
                                    )
                                }
                            }
                        }
                    }
                }
            }
    }
}

@Composable
private fun ListHeader(state: ListDetailUiState) {
    val detail = state.detail ?: return
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(text = detail.list.title, variant = TextVariant.H2, color = OmicronTheme.colors.foreground)
        if (detail.list.description.isNotBlank()) {
            Text(text = detail.list.description, variant = TextVariant.P, color = OmicronTheme.colors.foregroundAlt)
        }
        val count =
            if (detail.list.itemCount == 1) {
                stringResource(Res.string.lists_item_count_one)
            } else {
                stringResource(Res.string.lists_item_count_many, detail.list.itemCount)
            }
        Text(text = "${detail.owner.displayName} · $count", variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
    }
}

@Composable
private fun ListPostRow(
    post: Post,
    onClick: () -> Unit,
) {
    val preview = remember(post.summary, post.contentHtml) { postPreview(post.summary, post.contentHtml) }
    Row(
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(horizontal = 16.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(text = post.author.displayName, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 1)
            Text(
                text = post.title?.ifBlank { null } ?: stringResource(Res.string.timeline_untitled),
                variant = TextVariant.H3,
                color = OmicronTheme.colors.foreground,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (preview.excerpt.isNotBlank()) {
                Text(text = preview.excerpt, variant = TextVariant.P, color = OmicronTheme.colors.mutedForeground, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                ListPostCount(RikkaIcons.Heart, post.likeCount)
                ListPostCount(RikkaIcons.MessageCircle, post.commentCount)
                ListPostCount(RikkaIcons.Repeat, post.recommendCount)
            }
        }
        post.bannerUrl?.let { url ->
            AsyncImage(
                model = url,
                contentDescription = null,
                modifier = Modifier.size(width = 96.dp, height = 72.dp).clip(RikkaTheme.shapes.md).border(1.dp, OmicronTheme.colors.borderCard, RikkaTheme.shapes.md),
            )
        }
    }
}

@Composable
private fun ListPostCount(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: Int,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(imageVector = icon, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Sm)
        Text(text = count.toString(), variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
    }
}

@Composable
private fun ListDetailError(
    error: MobileFeatureError,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Text(text = stringResource(errorMessage(error)), variant = TextVariant.P, color = OmicronTheme.colors.foregroundAlt)
        Button(text = stringResource(Res.string.list_detail_retry), onClick = onRetry, variant = ButtonVariant.Outline)
    }
}

private fun errorMessage(error: MobileFeatureError) =
    when (error) {
        MobileFeatureError.Offline -> Res.string.list_detail_error_offline
        MobileFeatureError.Server -> Res.string.list_detail_error_server
        MobileFeatureError.MissingInstance -> Res.string.list_detail_error_missing_instance
    }
