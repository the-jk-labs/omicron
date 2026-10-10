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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.foundation.rememberScrollState
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
import org.omicron.mobile.core.designsystem.SessionExpiredNotice
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.input.Input
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.data.repository.resolveMediaUrl
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostDetail
import org.omicron.mobile.domain.model.Comment
import org.omicron.mobile.resources.Res
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
import org.omicron.mobile.resources.social_action_error
import org.omicron.mobile.resources.social_comment_cancel_reply
import org.omicron.mobile.resources.social_comment_cancel
import org.omicron.mobile.resources.social_comment_edit
import org.omicron.mobile.resources.social_comment_edit_error
import org.omicron.mobile.resources.social_comment_delete
import org.omicron.mobile.resources.social_comment_delete_confirm
import org.omicron.mobile.resources.social_comment_delete_error
import org.omicron.mobile.resources.social_comment_empty
import org.omicron.mobile.resources.social_comment_error
import org.omicron.mobile.resources.social_comment_like
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
import org.omicron.mobile.resources.social_unlike
import org.omicron.mobile.resources.social_unrecommend
import org.omicron.mobile.resources.timeline_session_expired
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
    socialViewModel: PostSocialViewModel? = null,
    onSignIn: () -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
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
                PostDetailContent(
                    post = if (post.isOfflineCopy) post else social?.post ?: post,
                    related = state.related,
                    origin = origin,
                    social = social,
                    onOpenPost = onOpenPost,
                    onOpenProfile = onOpenProfile,
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
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
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
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (post.title != null) {
                    Text(text = post.title, variant = TextVariant.H1)
                }
                PostDetailMeta(post = post, onOpenProfile = { onOpenProfile(post.author.username) })
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
        if (social != null && !post.isOfflineCopy) {
            item(key = "social-actions", contentType = "social-actions") {
                PostSocialActions(
                    state = social,
                    onSignIn = onSignIn,
                    onToggleLike = onToggleLike,
                    onToggleRecommendation = onToggleRecommendation,
                    onToggleReadLater = onToggleReadLater,
                    onRetryReadLater = onRetryReadLater,
                )
            }
            item(key = "comments-header", contentType = "comments-header") {
                Text(
                    text = stringResource(Res.string.social_comments_title, post.commentCount),
                    variant = TextVariant.H3,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
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
                    Text(
                        text =
                            stringResource(
                                when {
                                    it == SocialActionError.Comment && social.editingCommentId != null -> Res.string.social_comment_edit_error
                                    it == SocialActionError.Comment -> Res.string.social_comment_post_error
                                    it == SocialActionError.Delete -> Res.string.social_comment_delete_error
                                    else -> Res.string.social_action_error
                                },
                            ),
                        variant = TextVariant.Small,
                        color = RikkaTheme.colors.destructive,
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
                            onReply = onReplyTo,
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
                                onReply = onReplyTo,
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
                                    Button(text = stringResource(Res.string.social_comment_load_more), onClick = onLoadMoreComments, size = ButtonSize.Lg)
                                }
                            }
                        }
                    }
                }
            }
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
private fun PostDetailMeta(
    post: PostDetail,
    onOpenProfile: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = post.author.displayName,
            variant = TextVariant.Small,
            modifier = Modifier.clickable(role = Role.Button, onClick = onOpenProfile),
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
private fun PostSocialActions(
    state: PostSocialUiState,
    onSignIn: () -> Unit,
    onToggleLike: () -> Unit,
    onToggleRecommendation: () -> Unit,
    onToggleReadLater: () -> Unit,
    onRetryReadLater: () -> Unit,
) {
    val post = state.post ?: return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Button(
                text = "${stringResource(if (post.liked) Res.string.social_unlike else Res.string.social_like)} · ${post.likeCount}",
                onClick = if (state.signedIn) onToggleLike else onSignIn,
                enabled = !state.likeBusy,
                loading = state.likeBusy,
                size = ButtonSize.Lg,
                selected = post.liked,
                variant = if (post.liked) ButtonVariant.Secondary else ButtonVariant.Ghost,
                leadingIcon = { Icon(imageVector = RikkaIcons.Heart, contentDescription = null) },
            )
            Button(
                text = stringResource(if (post.recommended) Res.string.social_unrecommend else Res.string.social_recommend),
                onClick = if (state.signedIn) onToggleRecommendation else onSignIn,
                enabled = !state.recommendationBusy,
                loading = state.recommendationBusy,
                size = ButtonSize.Lg,
                selected = post.recommended,
                variant = if (post.recommended) ButtonVariant.Secondary else ButtonVariant.Ghost,
                leadingIcon = { Icon(imageVector = RikkaIcons.Repeat, contentDescription = null) },
            )
            Button(
                text = stringResource(if (state.saved) Res.string.social_saved else Res.string.social_save),
                onClick = if (state.signedIn) onToggleReadLater else onSignIn,
                enabled =
                    !state.signedIn ||
                        (!state.readLaterLoading && !state.readLaterBusy && state.readLaterListId != null),
                loading = state.signedIn && (state.readLaterLoading || state.readLaterBusy),
                size = ButtonSize.Lg,
                selected = state.saved,
                variant = if (state.saved) ButtonVariant.Secondary else ButtonVariant.Ghost,
                leadingIcon = { Icon(imageVector = RikkaIcons.Bookmark, contentDescription = null) },
            )
        }
        if (state.likeError != null || state.recommendationError != null || state.readLaterError != null) {
            Row(modifier = Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(Res.string.social_action_error),
                    variant = TextVariant.Small,
                    color = RikkaTheme.colors.destructive,
                )
                if (state.readLaterError != null && state.signedIn) {
                    Button(
                        text = stringResource(Res.string.profile_retry),
                        onClick = onRetryReadLater,
                        size = ButtonSize.Sm,
                        variant = ButtonVariant.Ghost,
                    )
                }
            }
        }
    }
}

@Composable
private fun CommentComposer(
    state: PostSocialUiState,
    onSignIn: () -> Unit,
    onUpdateDraft: (String) -> Unit,
    onReplyTo: (String?) -> Unit,
    onSubmit: () -> Unit,
) {
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
                Button(
                    text = stringResource(Res.string.social_comment_cancel_reply),
                    onClick = { onReplyTo(null) },
                    size = ButtonSize.Sm,
                    variant = ButtonVariant.Ghost,
                )
            }
            Input(
                value = state.draft,
                onValueChange = onUpdateDraft,
                placeholder = stringResource(if (state.replyingTo == null) Res.string.social_comment_placeholder else Res.string.social_comment_reply_placeholder),
                label = stringResource(if (state.replyingTo == null) Res.string.social_comment_placeholder else Res.string.social_comment_reply_placeholder),
                enabled = !state.commentBusy,
                singleLine = false,
                maxLength = 2000,
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(
                    text = stringResource(Res.string.social_comment_post),
                    onClick = onSubmit,
                    enabled = state.draft.isNotBlank() && !state.commentBusy,
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
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = comment.author.displayName,
            variant = TextVariant.Small,
            color = OmicronTheme.colors.foregroundAlt,
            modifier = Modifier.clickable(role = Role.Button) { onOpenProfile(comment.author.username) },
        )
        if (state.editingCommentId == comment.id) {
            Input(
                value = state.editDraft,
                onValueChange = onUpdateEdit,
                placeholder = stringResource(Res.string.social_comment_placeholder),
                label = stringResource(Res.string.social_comment_placeholder),
                enabled = !state.editBusy,
                singleLine = false,
                maxLength = 2000,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(text = stringResource(Res.string.social_comment_save), onClick = onSaveEdit, enabled = !state.editBusy, loading = state.editBusy, size = ButtonSize.Sm)
                Button(text = stringResource(Res.string.social_comment_cancel), onClick = onCancelEdit, enabled = !state.editBusy, size = ButtonSize.Sm, variant = ButtonVariant.Outline)
            }
        } else if (state.deleteConfirmationId == comment.id) {
            Text(text = stringResource(Res.string.social_comment_delete_confirm), variant = TextVariant.Small)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    text = stringResource(Res.string.social_comment_delete),
                    onClick = onConfirmDelete,
                    size = ButtonSize.Sm,
                    variant = ButtonVariant.Destructive,
                )
                Button(
                    text = stringResource(Res.string.social_comment_cancel),
                    onClick = onCancelDelete,
                    size = ButtonSize.Sm,
                    variant = ButtonVariant.Outline,
                )
            }
        } else {
            Text(text = comment.content, variant = TextVariant.P)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Button(
                    text = "${stringResource(if (comment.liked) Res.string.social_comment_unlike else Res.string.social_comment_like)} · ${comment.likeCount}",
                    onClick = if (state.signedIn) ({ onLike(comment.id) }) else onSignIn,
                    enabled = comment.id !in state.commentBusyIds,
                    size = ButtonSize.Sm,
                    variant = if (comment.liked) ButtonVariant.Secondary else ButtonVariant.Ghost,
                    leadingIcon = { Icon(imageVector = RikkaIcons.Heart, contentDescription = null) },
                )
                Button(text = stringResource(Res.string.social_comment_reply), onClick = if (state.signedIn) ({ onReply(comment.id) }) else onSignIn, size = ButtonSize.Sm, variant = ButtonVariant.Ghost)
                if (state.currentUser?.id == comment.author.id) {
                    Button(text = stringResource(Res.string.social_comment_edit), onClick = { onBeginEdit(comment) }, size = ButtonSize.Sm, variant = ButtonVariant.Ghost)
                    Button(text = stringResource(Res.string.social_comment_delete), onClick = { onRequestDelete(comment.id) }, size = ButtonSize.Sm, variant = ButtonVariant.Ghost)
                }
            }
        }
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
