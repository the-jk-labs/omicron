package org.omicron.mobile.feature.discovery

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButton
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.discover_articles_many
import org.omicron.mobile.resources.discover_articles_one
import org.omicron.mobile.resources.discover_followers_many
import org.omicron.mobile.resources.discover_followers_one
import org.omicron.mobile.resources.tag_back
import org.omicron.mobile.resources.tag_empty_articles
import org.omicron.mobile.resources.tag_error_offline
import org.omicron.mobile.resources.tag_error_server
import org.omicron.mobile.resources.tag_follow
import org.omicron.mobile.resources.tag_follow_error
import org.omicron.mobile.resources.tag_following
import org.omicron.mobile.resources.tag_load_more
import org.omicron.mobile.resources.tag_loading
import org.omicron.mobile.resources.tag_loading_more
import org.omicron.mobile.resources.tag_not_found_description
import org.omicron.mobile.resources.tag_not_found_title
import org.omicron.mobile.resources.tag_retry
import org.omicron.mobile.resources.tag_sign_in_to_follow
import org.omicron.mobile.resources.timeline_error_missing_instance

@Composable
fun TagRoute(
    viewModel: TagViewModel,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    TagScreen(
        state = state,
        onBack = onBack,
        onRetry = viewModel::retry,
        onLoadMore = viewModel::loadMore,
        onToggleFollow = viewModel::toggleFollow,
        onSignIn = onSignIn,
        onOpenPost = onOpenPost,
    )
}

@Composable
private fun TagScreen(
    state: TagUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    onToggleFollow: () -> Unit,
    onSignIn: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                icon = RikkaIcons.ArrowLeft,
                contentDescription = stringResource(Res.string.tag_back),
                onClick = onBack,
                size = IconButtonSize.Default,
            )
            Text(
                text = state.detail?.let { "#${it.name}" } ?: "",
                variant = TextVariant.H2,
                color = OmicronTheme.colors.foreground,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
        }
        Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            when (val phase = state.phase) {
                is TagPhase.Loading -> TagLoading()
                is TagPhase.Empty ->
                    TagContent(
                        state = state,
                        onLoadMore = onLoadMore,
                        onToggleFollow = onToggleFollow,
                        onSignIn = onSignIn,
                        onOpenPost = onOpenPost,
                    )
                is TagPhase.Error -> TagError(error = phase.error, onRetry = onRetry)
                is TagPhase.Content ->
                    TagContent(
                        state = state,
                        onLoadMore = onLoadMore,
                        onToggleFollow = onToggleFollow,
                        onSignIn = onSignIn,
                        onOpenPost = onOpenPost,
                    )
            }
        }
    }
}

@Composable
private fun TagLoading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.tag_loading))
    }
}

@Composable
private fun TagError(error: TagError, onRetry: () -> Unit) {
    val title =
        when (error) {
            TagError.NotFound -> stringResource(Res.string.tag_not_found_title)
            TagError.Offline -> stringResource(Res.string.tag_error_offline)
            TagError.Server -> stringResource(Res.string.tag_error_server)
            TagError.MissingInstance -> stringResource(Res.string.timeline_error_missing_instance)
        }
    val description =
        when (error) {
            TagError.NotFound -> stringResource(Res.string.tag_not_found_description)
            else -> null
        }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = title, variant = TextVariant.H3)
        description?.let { Text(text = it, variant = TextVariant.Muted) }
        Button(text = stringResource(Res.string.tag_retry), onClick = onRetry, size = ButtonSize.Lg)
    }
}

@Composable
private fun TagContent(
    state: TagUiState,
    onLoadMore: () -> Unit,
    onToggleFollow: () -> Unit,
    onSignIn: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    val detail = state.detail ?: return
    LazyColumn(
        modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth(),
    ) {
        item(key = "tag-header", contentType = "tag-header") {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "#${detail.name}",
                    variant = TextVariant.H1,
                    color = OmicronTheme.colors.foreground,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(
                        text =
                            if (detail.postCount == 1) {
                                stringResource(Res.string.discover_articles_one)
                            } else {
                                stringResource(Res.string.discover_articles_many, detail.postCount)
                            },
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.mutedForeground,
                    )
                    Text(
                        text =
                            if (detail.followerCount == 1) {
                                stringResource(Res.string.discover_followers_one)
                            } else {
                                stringResource(Res.string.discover_followers_many, detail.followerCount)
                            },
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.mutedForeground,
                    )
                }
                if (state.signedIn) {
                    Button(
                        text =
                            if (detail.isFollowing) {
                                stringResource(Res.string.tag_following)
                            } else {
                                stringResource(Res.string.tag_follow)
                            },
                        onClick = onToggleFollow,
                        variant = if (detail.isFollowing) ButtonVariant.Outline else ButtonVariant.Default,
                        size = ButtonSize.Lg,
                        loading = state.followBusy,
                    )
                } else {
                    Button(
                        text = stringResource(Res.string.tag_sign_in_to_follow),
                        onClick = onSignIn,
                        variant = ButtonVariant.Outline,
                        size = ButtonSize.Lg,
                    )
                }
                if (state.followError) {
                    Text(text = stringResource(Res.string.tag_follow_error), variant = TextVariant.Small)
                }
            }
        }
        if (state.posts.isEmpty()) {
            item(key = "tag-empty", contentType = "tag-empty") {
                Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(Res.string.tag_empty_articles), variant = TextVariant.Muted)
                }
            }
        } else {
            items(
                items = state.posts,
                key = { post -> post.id },
                contentType = { DISCOVERY_POST_TYPE },
            ) { post ->
                DiscoveryPostRow(post = post, onOpen = { onOpenPost(post.id) })
            }
        }
        if (state.nextCursor != null) {
            item(key = "tag-load-more", contentType = "tag-load-more") {
                Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    if (state.isLoadingMore) {
                        Spinner(size = SpinnerSize.Sm, label = stringResource(Res.string.tag_loading_more))
                    } else {
                        Button(
                            text = stringResource(Res.string.tag_load_more),
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
