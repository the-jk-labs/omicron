package org.omicron.mobile.feature.reader

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.StringResource
import org.omicron.mobile.core.article.languageLabel
import org.omicron.mobile.core.article.parseArticle
import org.omicron.mobile.core.article.postPreview
import org.omicron.mobile.core.designsystem.CenteredLoadingState
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.SessionExpiredNotice
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.input.Input
import org.omicron.mobile.core.designsystem.rikkaui.input.InputAnimation
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.core.time.displayDate
import org.omicron.mobile.data.repository.resolveMediaUrl
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostDetail
import org.omicron.mobile.domain.model.Comment
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.auth_sign_in
import org.omicron.mobile.resources.detail_back
import org.omicron.mobile.resources.detail_cover_credit
import org.omicron.mobile.resources.detail_error_missing_instance
import org.omicron.mobile.resources.detail_error_offline
import org.omicron.mobile.resources.detail_error_server
import org.omicron.mobile.resources.detail_loading
import org.omicron.mobile.resources.detail_offline_copy
import org.omicron.mobile.resources.detail_not_found_description
import org.omicron.mobile.resources.detail_not_found_title
import org.omicron.mobile.resources.detail_read_next
import org.omicron.mobile.resources.detail_retry
import org.omicron.mobile.resources.profile_retry
import org.omicron.mobile.resources.social_error_offline
import org.omicron.mobile.resources.social_error_unauthorized
import org.omicron.mobile.resources.social_error_forbidden
import org.omicron.mobile.resources.social_like_error
import org.omicron.mobile.resources.social_recommend_error
import org.omicron.mobile.resources.social_save_error
import org.omicron.mobile.resources.social_comment_cancel_reply
import org.omicron.mobile.resources.social_comment_cancel
import org.omicron.mobile.resources.social_comment_edit
import org.omicron.mobile.resources.social_comment_edit_placeholder
import org.omicron.mobile.resources.social_comment_edit_error
import org.omicron.mobile.resources.social_comment_delete
import org.omicron.mobile.resources.social_comment_delete_confirm
import org.omicron.mobile.resources.social_comment_delete_error
import org.omicron.mobile.resources.social_comment_empty
import org.omicron.mobile.resources.social_comment_error
import org.omicron.mobile.resources.social_comment_like
import org.omicron.mobile.resources.social_comment_like_count
import org.omicron.mobile.resources.social_comment_like_count_one
import org.omicron.mobile.resources.social_comment_like_error
import org.omicron.mobile.resources.social_comment_sending
import org.omicron.mobile.resources.social_comment_replying_to
import org.omicron.mobile.resources.social_comment_load_more
import org.omicron.mobile.resources.social_comment_loading
import org.omicron.mobile.resources.social_comment_placeholder
import org.omicron.mobile.resources.social_comment_post
import org.omicron.mobile.resources.social_comment_post_error
import org.omicron.mobile.resources.social_comment_reply
import org.omicron.mobile.resources.social_comment_reply_placeholder
import org.omicron.mobile.resources.social_comment_save
import org.omicron.mobile.resources.social_comment_sign_in
import org.omicron.mobile.resources.social_comments_title
import org.omicron.mobile.resources.social_comment_unlike
import org.omicron.mobile.resources.social_recommend
import org.omicron.mobile.resources.social_save
import org.omicron.mobile.resources.social_saved
import org.omicron.mobile.resources.social_like
import org.omicron.mobile.resources.timeline_comment_action
import org.omicron.mobile.resources.timeline_session_expired
import org.omicron.mobile.resources.timeline_change_instance
import org.omicron.mobile.resources.timeline_reading_time
import org.omicron.mobile.resources.timeline_untitled
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun PostDetailRoute(
    viewModel: PostDetailViewModel,
    onBack: () -> Unit,
    onOpenPost: (String) -> Unit,
    onChangeInstance: () -> Unit,
    socialViewModel: PostSocialViewModel? = null,
    onSignIn: () -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
    onOpenTag: (String) -> Unit = {},
) {
    val state by viewModel.uiState.collectAsState()
    val origin by viewModel.origin.collectAsState()
    val socialState = socialViewModel?.uiState?.collectAsState()?.value
    if (socialViewModel != null) {
        LaunchedEffect(state.post?.id, state.post?.isOfflineCopy) {
            state.post?.takeUnless { it.isOfflineCopy }?.let(socialViewModel::bind)
        }
    }
    PostDetailScreen(
        state = state,
        social = socialState,
        origin = origin,
        onBack = onBack,
        onRetry = viewModel::retry,
        onOpenPost = onOpenPost,
        onChangeInstance = onChangeInstance,
        onSignIn = onSignIn,
        onOpenProfile = onOpenProfile,
        onOpenTag = onOpenTag,
        onToggleLike = socialViewModel?.let { { it.toggleLike() } } ?: {},
        onToggleRecommendation = socialViewModel?.let { { it.toggleRecommendation() } } ?: {},
        onToggleReadLater = socialViewModel?.let { { it.toggleReadLater() } } ?: {},
        onRetryReadLater = socialViewModel?.let { { it.retryReadLater() } } ?: {},
        onUpdateDraft = socialViewModel?.let { { value -> it.updateDraft(value) } } ?: {},
        onReplyTo = socialViewModel?.let { { id -> it.replyTo(id) } } ?: {},
        onSubmitComment = socialViewModel?.let { { it.submitComment() } } ?: {},
        onLikeComment = socialViewModel?.let { { id -> it.toggleCommentLike(id) } } ?: {},
        onBeginEdit = socialViewModel?.let { { comment -> it.beginEdit(comment) } } ?: {},
        onUpdateEdit = socialViewModel?.let { { value -> it.updateEditDraft(value) } } ?: {},
        onCancelEdit = socialViewModel?.let { { it.cancelEdit() } } ?: {},
        onSaveEdit = socialViewModel?.let { { it.saveEdit() } } ?: {},
        onRequestDelete = socialViewModel?.let { { id -> it.requestDelete(id) } } ?: {},
        onCancelDelete = socialViewModel?.let { { it.cancelDelete() } } ?: {},
        onConfirmDelete = socialViewModel?.let { { it.confirmDelete() } } ?: {},
        onLoadMoreComments = socialViewModel?.let { { it.loadMoreComments() } } ?: {},
        onRetryComments = socialViewModel?.let { { it.retryComments() } } ?: {},
    )
}

@Composable
private fun PostDetailScreen(
    state: PostDetailUiState,
    social: PostSocialUiState?,
    origin: String?,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onOpenPost: (String) -> Unit,
    onChangeInstance: () -> Unit,
    onSignIn: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenTag: (String) -> Unit,
    onToggleLike: () -> Unit,
    onToggleRecommendation: () -> Unit,
    onToggleReadLater: () -> Unit,
    onRetryReadLater: () -> Unit,
    onUpdateDraft: (String) -> Unit,
    onReplyTo: (String?) -> Unit,
    onSubmitComment: () -> Unit,
    onLikeComment: (String) -> Unit,
    onBeginEdit: (Comment) -> Unit,
    onUpdateEdit: (String) -> Unit,
    onCancelEdit: () -> Unit,
    onSaveEdit: () -> Unit,
    onRequestDelete: (String) -> Unit,
    onCancelDelete: () -> Unit,
    onConfirmDelete: () -> Unit,
    onLoadMoreComments: () -> Unit,
    onRetryComments: () -> Unit,
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
                Icon(imageVector = RikkaIcons.ChevronLeft, contentDescription = null)
            }
        }
        when (val phase = state.phase) {
            is PostDetailPhase.Loading ->
                CenteredLoadingState(message = stringResource(Res.string.detail_loading), modifier = Modifier.weight(1f).fillMaxWidth())
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
                PostDetailContent(
                    post = if (post.isOfflineCopy) post else social?.post ?: post,
                    related = state.related,
                    origin = origin,
                    social = social,
                    onOpenPost = onOpenPost,
                    onOpenProfile = onOpenProfile,
                    onOpenTag = onOpenTag,
                    onSignIn = onSignIn,
                    onToggleLike = onToggleLike,
                    onToggleRecommendation = onToggleRecommendation,
                    onToggleReadLater = onToggleReadLater,
                    onRetryReadLater = onRetryReadLater,
                    onUpdateDraft = onUpdateDraft,
                    onReplyTo = onReplyTo,
                    onSubmitComment = onSubmitComment,
                    onLikeComment = onLikeComment,
                    onBeginEdit = onBeginEdit,
                    onUpdateEdit = onUpdateEdit,
                    onCancelEdit = onCancelEdit,
                    onSaveEdit = onSaveEdit,
                    onRequestDelete = onRequestDelete,
                    onCancelDelete = onCancelDelete,
                    onConfirmDelete = onConfirmDelete,
                    onLoadMoreComments = onLoadMoreComments,
                    onRetryComments = onRetryComments,
                )
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
    social: PostSocialUiState?,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenTag: (String) -> Unit,
    onSignIn: () -> Unit,
    onToggleLike: () -> Unit,
    onToggleRecommendation: () -> Unit,
    onToggleReadLater: () -> Unit,
    onRetryReadLater: () -> Unit,
    onUpdateDraft: (String) -> Unit,
    onReplyTo: (String?) -> Unit,
    onSubmitComment: () -> Unit,
    onLikeComment: (String) -> Unit,
    onBeginEdit: (Comment) -> Unit,
    onUpdateEdit: (String) -> Unit,
    onCancelEdit: () -> Unit,
    onSaveEdit: () -> Unit,
    onRequestDelete: (String) -> Unit,
    onCancelDelete: () -> Unit,
    onConfirmDelete: () -> Unit,
    onLoadMoreComments: () -> Unit,
    onRetryComments: () -> Unit,
) {
    val blocks =
        remember(post.contentHtml, origin) {
            parseArticle(post.contentHtml) { url ->
                if (origin != null) resolveMediaUrl(origin, url) else url
            }
        }
    val readingMinutes =
        remember(post.summary, post.contentHtml) {
            postPreview(post.summary, post.contentHtml).readingMinutes
        }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val responsesIndex =
        (if (social?.sessionExpired == true) 1 else 0) +
            (if (post.isOfflineCopy) 1 else 0) +
            (if (post.tags.isNotEmpty()) 1 else 0) +
            RESPONSE_SECTION_PRECEDING_ITEMS
    val onReply: (String?) -> Unit = { id ->
        onReplyTo(id)
        if (id != null && social?.commentBusy == false) {
            scope.launch { listState.animateScrollToItem(responsesIndex + 1) }
        }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (social?.sessionExpired == true) {
            item(key = "session-expired", contentType = "session-expired") {
                SessionExpiredNotice(
                    message = stringResource(Res.string.timeline_session_expired),
                    onSignIn = onSignIn,
                )
            }
        }
        if (post.isOfflineCopy) {
            item(key = "offline-copy", contentType = "offline-copy") {
                Text(
                    text = stringResource(Res.string.detail_offline_copy),
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.foregroundAlt,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }
        item(key = "header", contentType = "header") {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (post.title != null) {
                    Text(text = post.title, variant = TextVariant.H1)
                }
                PostDetailMeta(
                    post = post,
                    readingMinutes = readingMinutes,
                    onOpenProfile = { onOpenProfile(post.author.username) },
                )
                if (post.coverUrl != null) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        CoverImage(url = post.coverUrl, modifier = Modifier.padding(top = 16.dp))
                        val credit = post.coverCredit
                        if (credit != null) {
                            Text(
                                text = stringResource(Res.string.detail_cover_credit, credit.name, credit.source),
                                variant = TextVariant.Small,
                                color = OmicronTheme.colors.mutedForeground,
                            )
                        }
                    }
                }
            }
        }
        item(key = "body", contentType = "body") {
            ArticleBody(
                blocks = blocks,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 28.dp),
            )
        }
        if (post.tags.isNotEmpty()) {
            item(key = "tags", contentType = "tags") {
                Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 28.dp)) {
                    TagPills(tags = post.tags, onOpenTag = onOpenTag)
                }
            }
        }
        if (social != null && !post.isOfflineCopy) {
            item(key = "engagement", contentType = "engagement") {
                PostEngagementBar(
                    state = social,
                    onSignIn = onSignIn,
                    onToggleLike = onToggleLike,
                    onToggleRecommendation = onToggleRecommendation,
                    onToggleReadLater = onToggleReadLater,
                    onRetryReadLater = onRetryReadLater,
                    onOpenResponses = { scope.launch { listState.animateScrollToItem(responsesIndex) } },
                )
            }
            item(key = "responses-divider", contentType = "section-divider") {
                SectionDivider()
            }
            item(key = "comments-header", contentType = "comments-header") {
                Text(
                    text = stringResource(Res.string.social_comments_title, post.commentCount),
                    variant = TextVariant.H3,
                    modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 12.dp),
                )
            }
            item(key = "comment-composer", contentType = "comment-composer") {
                CommentComposer(
                    state = social,
                    onSignIn = onSignIn,
                    onUpdateDraft = onUpdateDraft,
                    onReplyTo = onReplyTo,
                    onSubmit = onSubmitComment,
                )
            }
            social.commentError?.let {
                item(key = "comment-action-error", contentType = "error") {
                    SocialActionFeedback(
                        error = it,
                        fallback = Res.string.social_comment_post_error,
                        onRetry = if (it == SocialActionError.Unauthorized) onSignIn else onSubmitComment,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }
            if (social.commentsLoading && social.comments.isEmpty()) {
                item(key = "comments-loading", contentType = "loading") {
                    Box(modifier = Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) {
                        Spinner(size = SpinnerSize.Default, label = stringResource(Res.string.social_comment_loading))
                    }
                }
            } else if (social.commentsError != null && social.comments.isEmpty()) {
                item(key = "comments-error", contentType = "error") {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(text = stringResource(Res.string.social_comment_error), variant = TextVariant.Small)
                        Button(text = stringResource(Res.string.profile_retry), onClick = onRetryComments, size = ButtonSize.Lg)
                    }
                }
            } else if (social.comments.isEmpty()) {
                item(key = "comments-empty", contentType = "empty") {
                    Text(
                        text = stringResource(Res.string.social_comment_empty),
                        variant = TextVariant.Small,
                        modifier = Modifier.fillMaxWidth().padding(20.dp),
                    )
                }
            } else {
                items(items = social.comments, key = { comment -> comment.id }, contentType = { "comment-thread" }) { comment ->
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        CommentItem(
                            comment = comment,
                            state = social,
                            onSignIn = onSignIn,
                            onOpenProfile = onOpenProfile,
                            onLike = onLikeComment,
                            onReply = onReply,
                            onBeginEdit = onBeginEdit,
                            onUpdateEdit = onUpdateEdit,
                            onCancelEdit = onCancelEdit,
                            onSaveEdit = onSaveEdit,
                            onRequestDelete = onRequestDelete,
                            onCancelDelete = onCancelDelete,
                            onConfirmDelete = onConfirmDelete,
                        )
                        comment.replies.forEach { reply ->
                            CommentItem(
                                comment = reply,
                                state = social,
                                modifier = Modifier.padding(start = 28.dp),
                                onSignIn = onSignIn,
                                onOpenProfile = onOpenProfile,
                                onLike = onLikeComment,
                                onReply = onReply,
                                onBeginEdit = onBeginEdit,
                                onUpdateEdit = onUpdateEdit,
                                onCancelEdit = onCancelEdit,
                                onSaveEdit = onSaveEdit,
                                onRequestDelete = onRequestDelete,
                                onCancelDelete = onCancelDelete,
                                onConfirmDelete = onConfirmDelete,
                            )
                        }
                    }
                }
                if (social.nextCommentCursor != null) {
                    item(key = "comments-load-more", contentType = "load-more") {
                        Box(modifier = Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) {
                            if (social.commentsLoadingMore) {
                                Spinner(size = SpinnerSize.Sm, label = stringResource(Res.string.social_comment_loading))
                            } else {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    if (social.commentsError != null) Text(text = stringResource(Res.string.social_comment_error), variant = TextVariant.Small)
                                    Button(text = stringResource(Res.string.social_comment_load_more), onClick = onLoadMoreComments, enabled = !social.commentBusy, size = ButtonSize.Lg)
                                }
                            }
                        }
                    }
                }
            }
        }
        if (related.isNotEmpty()) {
            item(key = "read-next-divider", contentType = "section-divider") {
                SectionDivider()
            }
            item(key = "read-next-title", contentType = "read-next-title") {
                Text(
                    text = stringResource(Res.string.detail_read_next),
                    variant = TextVariant.H3,
                    modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 4.dp),
                )
            }
            items(items = related, key = { item -> item.id }, contentType = { "related" }) { item ->
                RelatedCard(post = item, onOpen = { onOpenPost(item.id) })
            }
        }
    }
}
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PostDetailMeta(
    post: PostDetail,
    readingMinutes: Int,
    onOpenProfile: () -> Unit,
) {
    val metadataColor = OmicronTheme.colors.mutedForeground
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.clickable(role = Role.Button, onClick = onOpenProfile)) {
            AuthorAvatar(
                displayName = post.author.displayName,
                avatarUrl = post.author.avatarUrl,
                size = 44.dp,
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = post.author.displayName,
                variant = TextVariant.P,
                modifier = Modifier.clickable(role = Role.Button, onClick = onOpenProfile),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = OmicronTheme.colors.foreground,
                style = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
            )
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                MetaLabel(
                    icon = RikkaIcons.Calendar,
                    label = displayDate(post.createdAt),
                    tint = metadataColor,
                )
                MetaSeparator()
                MetaLabel(
                    icon = RikkaIcons.Clock,
                    label = stringResource(Res.string.timeline_reading_time, readingMinutes),
                    tint = metadataColor,
                )
                val originHost =
                    post.author.username.substringAfterLast('@').takeIf {
                        post.remote && post.author.username.contains('@')
                    }
                if (originHost != null) {
                    MetaSeparator()
                    MetaLabel(icon = RikkaIcons.Globe, label = originHost, tint = metadataColor)
                }
                val language = languageLabel(post.language)
                if (language.isNotEmpty()) {
                    MetaSeparator()
                    MetaLabel(icon = RikkaIcons.Languages, label = language, tint = metadataColor)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PostEngagementBar(
    state: PostSocialUiState,
    onSignIn: () -> Unit,
    onToggleLike: () -> Unit,
    onToggleRecommendation: () -> Unit,
    onToggleReadLater: () -> Unit,
    onRetryReadLater: () -> Unit,
    onOpenResponses: () -> Unit,
) {
    val post = state.post ?: return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp).padding(top = 28.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FlowRow(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                PostMetaAction(
                    imageVector = RikkaIcons.Heart,
                    label = stringResource(Res.string.social_like),
                    count = post.likeCount,
                    selected = post.liked,
                    enabled = !state.likeBusy,
                    onClick = if (state.signedIn) onToggleLike else onSignIn,
                )
                PostMetaAction(
                    imageVector = RikkaIcons.MessageCircle,
                    label = stringResource(Res.string.timeline_comment_action),
                    count = post.commentCount,
                    selected = null,
                    enabled = true,
                    onClick = onOpenResponses,
                )
                PostMetaAction(
                    imageVector = RikkaIcons.Recommend,
                    label = stringResource(Res.string.social_recommend),
                    count = post.recommendCount,
                    selected = post.recommended,
                    enabled = !state.recommendationBusy,
                    onClick = if (state.signedIn) onToggleRecommendation else onSignIn,
                )
            }
            PostMetaAction(
                imageVector = RikkaIcons.Bookmark,
                label = stringResource(if (state.saved) Res.string.social_saved else Res.string.social_save),
                selected = state.saved,
                enabled =
                    !state.signedIn ||
                        (!state.readLaterLoading && !state.readLaterBusy && state.readLaterListId != null),
                onClick = if (state.signedIn) onToggleReadLater else onSignIn,
            )
        }
        state.likeError?.let { error ->
            SocialActionFeedback(error, Res.string.social_like_error, if (error == SocialActionError.Unauthorized || !state.signedIn) onSignIn else onToggleLike, Modifier.padding(horizontal = 16.dp))
        }
        state.recommendationError?.let { error ->
            SocialActionFeedback(error, Res.string.social_recommend_error, if (error == SocialActionError.Unauthorized || !state.signedIn) onSignIn else onToggleRecommendation, Modifier.padding(horizontal = 16.dp))
        }
        state.readLaterError?.let { error ->
            SocialActionFeedback(error, Res.string.social_save_error, if (error == SocialActionError.Unauthorized || !state.signedIn) onSignIn else onRetryReadLater, Modifier.padding(horizontal = 16.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SocialActionFeedback(
    error: SocialActionError,
    fallback: StringResource,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(
                when (error) {
                    SocialActionError.Offline -> Res.string.social_error_offline
                    SocialActionError.Unauthorized -> Res.string.social_error_unauthorized
                    SocialActionError.Forbidden -> Res.string.social_error_forbidden
                    SocialActionError.Request -> fallback
                },
            ),
            variant = TextVariant.Small,
            color = OmicronTheme.colors.destructive,
        )
        if (error != SocialActionError.Forbidden) {
            Button(
                text = stringResource(if (error == SocialActionError.Unauthorized) Res.string.auth_sign_in else Res.string.profile_retry),
                onClick = onRetry,
                size = ButtonSize.Sm,
                variant = ButtonVariant.Ghost,
            )
        }
    }
}

@Composable
private fun SectionDivider() {
    Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 44.dp, bottom = 16.dp)) {
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(OmicronTheme.colors.borderCard),
        )
    }
}

private const val RESPONSE_SECTION_PRECEDING_ITEMS = 4

@Composable
private fun CommentComposer(
    state: PostSocialUiState,
    onSignIn: () -> Unit,
    onUpdateDraft: (String) -> Unit,
    onReplyTo: (String?) -> Unit,
    onSubmit: () -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(state.replyingTo) {
        if (state.replyingTo != null && state.signedIn) focusRequester.requestFocus()
    }
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!state.signedIn) {
            Button(
                text = stringResource(Res.string.social_comment_sign_in),
                onClick = onSignIn,
                size = ButtonSize.Lg,
                variant = ButtonVariant.Outline,
            )
        } else {
            if (state.replyingTo != null) {
                val target = state.comments.firstNotNullOfOrNull { comment ->
                    if (comment.id == state.replyingTo) comment else comment.replies.firstOrNull { it.id == state.replyingTo }
                }
                if (target != null) {
                    Text(text = stringResource(Res.string.social_comment_replying_to, target.author.displayName), variant = TextVariant.Small)
                }
                Button(
                    text = stringResource(Res.string.social_comment_cancel_reply),
                    onClick = { onReplyTo(null) },
                    size = ButtonSize.Sm,
                    variant = ButtonVariant.Ghost,
                    enabled = !state.commentBusy,
                )
            }
            Input(
                value = state.draft,
                onValueChange = onUpdateDraft,
                placeholder = stringResource(if (state.replyingTo == null) Res.string.social_comment_placeholder else Res.string.social_comment_reply_placeholder),
                label = stringResource(if (state.replyingTo == null) Res.string.social_comment_placeholder else Res.string.social_comment_reply_placeholder),
                enabled = !state.commentBusy,
                modifier = Modifier.heightIn(min = 80.dp).focusRequester(focusRequester),
                animation = InputAnimation.Color,
                singleLine = false,
                maxLength = 2000,
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(
                    text = stringResource(Res.string.social_comment_post),
                    onClick = onSubmit,
                    enabled = state.draft.isNotBlank() && !state.commentBusy && !state.commentsLoading,
                    loading = state.commentBusy,
                    size = ButtonSize.Lg,
                )
            }
        }
    }
}

@Composable
private fun CommentItem(
    comment: Comment,
    state: PostSocialUiState,
    modifier: Modifier = Modifier,
    onSignIn: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onLike: (String) -> Unit,
    onReply: (String?) -> Unit,
    onBeginEdit: (Comment) -> Unit,
    onUpdateEdit: (String) -> Unit,
    onCancelEdit: () -> Unit,
    onSaveEdit: () -> Unit,
    onRequestDelete: (String) -> Unit,
    onCancelDelete: () -> Unit,
    onConfirmDelete: () -> Unit,
) {
    val pending = comment.id == state.pendingCommentId
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).clickable(role = Role.Button) { onOpenProfile(comment.author.username) },
            contentAlignment = Alignment.TopCenter,
        ) {
            AuthorAvatar(comment.author.displayName, comment.author.avatarUrl, if (comment.parentId == null) 36.dp else 28.dp)
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = comment.author.displayName,
                variant = TextVariant.Small,
                color = OmicronTheme.colors.foreground,
                style = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
                modifier = Modifier.clickable(role = Role.Button) { onOpenProfile(comment.author.username) },
            )
            Text(
                text = if (pending) stringResource(Res.string.social_comment_sending) else displayDate(comment.createdAt),
                variant = TextVariant.Small,
                color = OmicronTheme.colors.mutedForeground,
                style = TextStyle(fontSize = 12.sp),
            )
            if (state.editingCommentId == comment.id) {
                CommentEditor(state, onUpdateEdit, onSaveEdit, onCancelEdit, onSignIn)
            } else if (state.deleteConfirmationId == comment.id) {
                CommentDeleteConfirmation(onConfirmDelete, onCancelDelete)
            } else {
                Text(text = comment.content, variant = TextVariant.P, style = TextStyle(fontSize = 14.sp, lineHeight = 20.sp))
                if (!pending) {
                    CommentActions(comment, state, onSignIn, onLike, onReply, onBeginEdit, onRequestDelete)
                }
            }
            state.commentLikeErrors[comment.id]?.let { error ->
                SocialActionFeedback(error, Res.string.social_comment_like_error, if (error == SocialActionError.Unauthorized) onSignIn else ({ onLike(comment.id) }))
            }
            state.deleteErrors[comment.id]?.let { error ->
                SocialActionFeedback(error, Res.string.social_comment_delete_error, if (error == SocialActionError.Unauthorized) onSignIn else ({ onRequestDelete(comment.id) }))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CommentEditor(
    state: PostSocialUiState,
    onUpdate: (String) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
    onSignIn: () -> Unit,
) {
    Input(
        value = state.editDraft,
        onValueChange = onUpdate,
        placeholder = stringResource(Res.string.social_comment_edit_placeholder),
        label = stringResource(Res.string.social_comment_edit_placeholder),
        enabled = !state.editBusy,
        animation = InputAnimation.Color,
        singleLine = false,
        maxLength = 2000,
    )
    state.editError?.let { error ->
        SocialActionFeedback(error, Res.string.social_comment_edit_error, if (error == SocialActionError.Unauthorized) onSignIn else onSave)
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CommentActionButton(Res.string.social_comment_save, onSave, enabled = !state.editBusy && state.editDraft.isNotBlank(), loading = state.editBusy, variant = ButtonVariant.Default)
        CommentActionButton(Res.string.social_comment_cancel, onCancel, enabled = !state.editBusy, variant = ButtonVariant.Outline)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CommentDeleteConfirmation(onConfirm: () -> Unit, onCancel: () -> Unit) {
    Text(text = stringResource(Res.string.social_comment_delete_confirm), variant = TextVariant.Small)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CommentActionButton(Res.string.social_comment_delete, onConfirm, variant = ButtonVariant.Destructive)
        CommentActionButton(Res.string.social_comment_cancel, onCancel, variant = ButtonVariant.Outline)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CommentActions(
    comment: Comment,
    state: PostSocialUiState,
    onSignIn: () -> Unit,
    onLike: (String) -> Unit,
    onReply: (String?) -> Unit,
    onEdit: (Comment) -> Unit,
    onDelete: (String) -> Unit,
) {
    val action = stringResource(if (comment.liked) Res.string.social_comment_unlike else Res.string.social_comment_like)
    val label = if (comment.likeCount == 1) {
        stringResource(Res.string.social_comment_like_count_one, action)
    } else {
        stringResource(Res.string.social_comment_like_count, action, comment.likeCount)
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), itemVerticalAlignment = Alignment.CenterVertically) {
        PostMetaAction(
            imageVector = RikkaIcons.Heart,
            label = label,
            count = comment.likeCount.takeIf { it > 0 },
            selected = comment.liked,
            enabled = comment.id !in state.commentBusyIds,
            onClick = if (state.signedIn) ({ onLike(comment.id) }) else onSignIn,
        )
        CommentActionButton(Res.string.social_comment_reply, if (state.signedIn) ({ onReply(comment.id) }) else onSignIn, enabled = !state.commentBusy)
        if (state.currentUser?.id == comment.author.id) {
            CommentActionButton(Res.string.social_comment_edit, { onEdit(comment) }, enabled = !state.editBusy)
            CommentActionButton(Res.string.social_comment_delete, { onDelete(comment.id) }, enabled = !state.editBusy && !state.commentBusy)
        }
    }
}

@Composable
private fun CommentActionButton(
    text: StringResource,
    onClick: () -> Unit,
    enabled: Boolean = true,
    loading: Boolean = false,
    variant: ButtonVariant = ButtonVariant.Ghost,
) {
    Button(
        text = stringResource(text),
        onClick = onClick,
        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
        enabled = enabled,
        loading = loading,
        size = ButtonSize.Sm,
        variant = variant,
    )
}

@Composable
private fun RelatedCard(
    post: Post,
    onOpen: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = post.title?.ifBlank { null } ?: stringResource(Res.string.timeline_untitled),
                variant = TextVariant.H3,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = post.author.displayName,
                variant = TextVariant.Small,
                color = OmicronTheme.colors.mutedForeground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (post.bannerUrl != null) {
            AsyncImage(
                model = post.bannerUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier =
                    Modifier
                        .size(width = 88.dp, height = 64.dp)
                        .clip(RikkaTheme.shapes.lg)
                        .border(1.dp, OmicronTheme.colors.borderCard, RikkaTheme.shapes.lg),
            )
        }
    }
}
