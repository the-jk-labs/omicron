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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.timeline_change_instance
import org.omicron.mobile.resources.timeline_empty_description
import org.omicron.mobile.resources.timeline_empty_title
import org.omicron.mobile.resources.timeline_error_missing_instance
import org.omicron.mobile.resources.timeline_error_offline
import org.omicron.mobile.resources.timeline_error_server
import org.omicron.mobile.resources.timeline_load_more
import org.omicron.mobile.resources.timeline_loading
import org.omicron.mobile.resources.timeline_loading_more
import org.omicron.mobile.resources.timeline_post_meta
import org.omicron.mobile.resources.timeline_refresh
import org.omicron.mobile.resources.timeline_retry
import org.omicron.mobile.resources.timeline_scope_global
import org.omicron.mobile.resources.timeline_scope_local
import org.omicron.mobile.resources.timeline_sign_in
import org.omicron.mobile.resources.timeline_title
import org.omicron.mobile.resources.timeline_untitled
import zed.rainxch.rikkaui.foundation.RikkaTheme

private const val POST_CONTENT_TYPE = "post"

@Composable
fun TimelineRoute(
    viewModel: TimelineViewModel,
    onSignIn: () -> Unit,
    onChangeInstance: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    TimelineScreen(
        state = state,
        onSelectScope = viewModel::selectScope,
        onRefresh = viewModel::refresh,
        onRetry = viewModel::retry,
        onLoadMore = viewModel::loadMore,
        onSignIn = onSignIn,
        onChangeInstance = onChangeInstance,
        onOpenPost = onOpenPost,
    )
}

@Composable
private fun TimelineScreen(
    state: TimelineUiState,
    onSelectScope: (TimelineScope) -> Unit,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    onSignIn: () -> Unit,
    onChangeInstance: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(RikkaTheme.colors.background).safeDrawingPadding(),
    ) {
        TimelineHeader(
            scope = state.scope,
            onSelectScope = onSelectScope,
            onSignIn = onSignIn,
            onChangeInstance = onChangeInstance,
        )
        Box(modifier = Modifier.fillMaxSize()) {
            when (val phase = state.phase) {
                is TimelinePhase.Loading -> TimelineLoading()
                is TimelinePhase.Empty -> TimelineEmpty(onRefresh = onRefresh)
                is TimelinePhase.Error ->
                    TimelineError(
                        error = phase.error,
                        onRetry = onRetry,
                        onChangeInstance = onChangeInstance,
                    )
                is TimelinePhase.Content ->
                    TimelineList(
                        state = state,
                        onRefresh = onRefresh,
                        onLoadMore = onLoadMore,
                        onOpenPost = onOpenPost,
                    )
            }
        }
    }
}

@Composable
private fun TimelineHeader(
    scope: TimelineScope,
    onSelectScope: (TimelineScope) -> Unit,
    onSignIn: () -> Unit,
    onChangeInstance: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = stringResource(Res.string.timeline_title), variant = TextVariant.H2)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    text = stringResource(Res.string.timeline_change_instance),
                    onClick = onChangeInstance,
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Sm,
                )
                Button(
                    text = stringResource(Res.string.timeline_sign_in),
                    onClick = onSignIn,
                    variant = ButtonVariant.Secondary,
                    size = ButtonSize.Sm,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                text = stringResource(Res.string.timeline_scope_global),
                onClick = { onSelectScope(TimelineScope.Global) },
                variant = if (scope == TimelineScope.Global) ButtonVariant.Default else ButtonVariant.Outline,
                size = ButtonSize.Sm,
            )
            Button(
                text = stringResource(Res.string.timeline_scope_local),
                onClick = { onSelectScope(TimelineScope.Local) },
                variant = if (scope == TimelineScope.Local) ButtonVariant.Default else ButtonVariant.Outline,
                size = ButtonSize.Sm,
            )
        }
    }
}

@Composable
private fun TimelineLoading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.timeline_loading))
    }
}

@Composable
private fun TimelineEmpty(onRefresh: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = stringResource(Res.string.timeline_empty_title), variant = TextVariant.H3)
        Text(text = stringResource(Res.string.timeline_empty_description), variant = TextVariant.Muted)
        Button(
            text = stringResource(Res.string.timeline_refresh),
            onClick = onRefresh,
            variant = ButtonVariant.Outline,
            size = ButtonSize.Lg,
        )
    }
}

@Composable
private fun TimelineError(
    error: TimelineError,
    onRetry: () -> Unit,
    onChangeInstance: () -> Unit,
) {
    val message =
        when (error) {
            TimelineError.Offline -> stringResource(Res.string.timeline_error_offline)
            TimelineError.Server -> stringResource(Res.string.timeline_error_server)
            TimelineError.MissingInstance -> stringResource(Res.string.timeline_error_missing_instance)
        }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = message, variant = TextVariant.P)
        if (error == TimelineError.MissingInstance) {
            Button(
                text = stringResource(Res.string.timeline_change_instance),
                onClick = onChangeInstance,
                size = ButtonSize.Lg,
            )
        } else {
            Button(
                text = stringResource(Res.string.timeline_retry),
                onClick = onRetry,
                size = ButtonSize.Lg,
            )
        }
    }
}

@Composable
private fun TimelineList(
    state: TimelineUiState,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        item(key = "refresh", contentType = "refresh") {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                Button(
                    text = stringResource(Res.string.timeline_refresh),
                    onClick = onRefresh,
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Sm,
                )
            }
        }
        items(
            items = state.posts,
            key = { post -> post.id },
            contentType = { POST_CONTENT_TYPE },
        ) { post ->
            PostCard(post = post, onOpen = { onOpenPost(post.id) })
        }
        if (state.nextCursor != null) {
            item(key = "load-more", contentType = "load-more") {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (state.isLoadingMore) {
                        Spinner(size = SpinnerSize.Sm, label = stringResource(Res.string.timeline_loading_more))
                    } else {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            if (state.loadMoreError != null) {
                                val message =
                                    when (state.loadMoreError) {
                                        TimelineError.Offline -> stringResource(Res.string.timeline_error_offline)
                                        TimelineError.Server -> stringResource(Res.string.timeline_error_server)
                                        TimelineError.MissingInstance ->
                                            stringResource(Res.string.timeline_error_missing_instance)
                                    }
                                Text(text = message, variant = TextVariant.Small)
                            }
                            Button(
                                text = stringResource(Res.string.timeline_load_more),
                                onClick = onLoadMore,
                                variant = ButtonVariant.Outline,
                                size = ButtonSize.Lg,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PostCard(
    post: Post,
    onOpen: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = post.author.displayName,
            variant = TextVariant.Small,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = post.title?.ifBlank { null } ?: stringResource(Res.string.timeline_untitled),
            variant = TextVariant.H3,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
        if (post.summary != null) {
            Text(
                text = post.summary,
                variant = TextVariant.Muted,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (post.tags.isNotEmpty()) {
            Text(
                text = post.tags.joinToString("  ") { "#${it.name}" },
                variant = TextVariant.Small,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = stringResource(Res.string.timeline_post_meta, post.likeCount, post.commentCount, post.recommendCount),
            variant = TextVariant.Small,
        )
    }
}
