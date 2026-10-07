package org.omicron.mobile.feature.reader

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.article.parseArticle
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.data.repository.resolveMediaUrl
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostDetail
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.detail_back
import org.omicron.mobile.resources.detail_cover_credit
import org.omicron.mobile.resources.detail_error_missing_instance
import org.omicron.mobile.resources.detail_error_offline
import org.omicron.mobile.resources.detail_error_server
import org.omicron.mobile.resources.detail_loading
import org.omicron.mobile.resources.detail_not_found_description
import org.omicron.mobile.resources.detail_not_found_title
import org.omicron.mobile.resources.detail_read_next
import org.omicron.mobile.resources.detail_retry
import org.omicron.mobile.resources.timeline_change_instance
import org.omicron.mobile.resources.timeline_post_meta
import org.omicron.mobile.resources.timeline_untitled
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun PostDetailRoute(
    viewModel: PostDetailViewModel,
    onBack: () -> Unit,
    onOpenPost: (String) -> Unit,
    onChangeInstance: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    val origin by viewModel.origin.collectAsState()
    PostDetailScreen(
        state = state,
        origin = origin,
        onBack = onBack,
        onRetry = viewModel::retry,
        onOpenPost = onOpenPost,
        onChangeInstance = onChangeInstance,
    )
}

@Composable
private fun PostDetailScreen(
    state: PostDetailUiState,
    origin: String?,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onOpenPost: (String) -> Unit,
    onChangeInstance: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(RikkaTheme.colors.background).safeDrawingPadding(),
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)) {
            Button(
                onClick = onBack,
                variant = ButtonVariant.Ghost,
                size = ButtonSize.Icon,
                label = stringResource(Res.string.detail_back),
            ) {
                Icon(imageVector = RikkaIcons.ArrowLeft, contentDescription = null)
            }
        }
        when (val phase = state.phase) {
            is PostDetailPhase.Loading ->
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.detail_loading))
                }
            is PostDetailPhase.NotFound ->
                PostDetailMessage(
                    title = stringResource(Res.string.detail_not_found_title),
                    description = stringResource(Res.string.detail_not_found_description),
                    actionLabel = stringResource(Res.string.detail_back),
                    onAction = onBack,
                )
            is PostDetailPhase.Error ->
                PostDetailMessage(
                    title =
                        when (phase.error) {
                            PostDetailError.Offline -> stringResource(Res.string.detail_error_offline)
                            PostDetailError.Server -> stringResource(Res.string.detail_error_server)
                            PostDetailError.MissingInstance -> stringResource(Res.string.detail_error_missing_instance)
                        },
                    description = null,
                    actionLabel =
                        if (phase.error == PostDetailError.MissingInstance) {
                            stringResource(Res.string.timeline_change_instance)
                        } else {
                            stringResource(Res.string.detail_retry)
                        },
                    onAction = if (phase.error == PostDetailError.MissingInstance) onChangeInstance else onRetry,
                )
            is PostDetailPhase.Content -> {
                val post = state.post ?: return@Column
                PostDetailContent(post = post, related = state.related, origin = origin, onOpenPost = onOpenPost)
            }
        }
    }
}

@Composable
private fun PostDetailMessage(
    title: String,
    description: String?,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = title, variant = TextVariant.H3)
        if (description != null) Text(text = description, variant = TextVariant.Muted)
        Button(text = actionLabel, onClick = onAction, size = ButtonSize.Lg)
    }
}

@Composable
private fun PostDetailContent(
    post: PostDetail,
    related: List<Post>,
    origin: String?,
    onOpenPost: (String) -> Unit,
) {
    val blocks =
        remember(post.contentHtml, origin) {
            parseArticle(post.contentHtml) { url ->
                if (origin != null) resolveMediaUrl(origin, url) else url
            }
        }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        item(key = "header", contentType = "header") {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (post.title != null) {
                    Text(text = post.title, variant = TextVariant.H1)
                }
                PostDetailMeta(post = post)
                if (post.coverUrl != null) {
                    CoverImage(url = post.coverUrl)
                    val credit = post.coverCredit
                    if (credit != null) {
                        Text(
                            text = stringResource(Res.string.detail_cover_credit, credit.name, credit.source),
                            variant = TextVariant.Small,
                        )
                    }
                }
            }
        }
        item(key = "body", contentType = "body") {
            ArticleBody(blocks = blocks, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp))
        }
        if (post.tags.isNotEmpty()) {
            item(key = "tags", contentType = "tags") {
                Text(
                    text = post.tags.joinToString("  ") { "#${it.name}" },
                    variant = TextVariant.Small,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
        }
        item(key = "counts", contentType = "counts") {
            Text(
                text =
                    stringResource(
                        Res.string.timeline_post_meta,
                        post.likeCount,
                        post.commentCount,
                        post.recommendCount,
                    ),
                variant = TextVariant.Small,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        if (related.isNotEmpty()) {
            item(key = "read-next-title", contentType = "read-next-title") {
                Text(
                    text = stringResource(Res.string.detail_read_next),
                    variant = TextVariant.H3,
                    modifier = Modifier.padding(horizontal = 16.dp).padding(top = 16.dp),
                )
            }
            items(items = related, key = { item -> item.id }, contentType = { "related" }) { item ->
                RelatedCard(post = item, onOpen = { onOpenPost(item.id) })
            }
        }
    }
}

@Composable
private fun PostDetailMeta(post: PostDetail) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = post.author.displayName,
            variant = TextVariant.Small,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        val originHost = post.author.username.substringAfter("@", "")
        val meta =
            buildList {
                add(post.createdAt.take(10))
                if (post.remote && originHost.isNotEmpty()) add(originHost)
                if (post.language != null) add(post.language)
            }.joinToString(" · ")
        Text(text = meta, variant = TextVariant.Small)
    }
}

@Composable
private fun RelatedCard(
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
            text = post.title?.ifBlank { null } ?: stringResource(Res.string.timeline_untitled),
            variant = TextVariant.H3,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(text = post.author.displayName, variant = TextVariant.Small, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
