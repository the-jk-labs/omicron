package org.omicron.mobile.feature.profile

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.SessionExpiredNotice
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButton
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.core.article.postPreview
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.Profile
import org.omicron.mobile.domain.model.ProfileFollowState
import org.omicron.mobile.domain.model.RelationActor
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.app_name
import org.omicron.mobile.resources.omicron_logo
import org.omicron.mobile.resources.profile_about
import org.omicron.mobile.resources.manage_open
import org.omicron.mobile.resources.profile_articles
import org.omicron.mobile.resources.profile_back
import org.omicron.mobile.resources.profile_block
import org.omicron.mobile.resources.profile_content_error
import org.omicron.mobile.resources.profile_empty_articles
import org.omicron.mobile.resources.profile_empty_recommendations
import org.omicron.mobile.resources.profile_error_offline
import org.omicron.mobile.resources.profile_error_server
import org.omicron.mobile.resources.profile_follow
import org.omicron.mobile.resources.profile_followers
import org.omicron.mobile.resources.profile_following
import org.omicron.mobile.resources.profile_following_count
import org.omicron.mobile.resources.profile_load_more
import org.omicron.mobile.resources.profile_loading_more
import org.omicron.mobile.resources.profile_mute
import org.omicron.mobile.resources.profile_no_followers
import org.omicron.mobile.resources.profile_no_following
import org.omicron.mobile.resources.profile_not_found
import org.omicron.mobile.resources.profile_private_description
import org.omicron.mobile.resources.profile_private_title
import org.omicron.mobile.resources.profile_recommendations
import org.omicron.mobile.resources.profile_relation_error_block
import org.omicron.mobile.resources.profile_relation_error_follow
import org.omicron.mobile.resources.profile_relation_error_mute
import org.omicron.mobile.resources.profile_retry
import org.omicron.mobile.resources.profile_sign_in_to_follow
import org.omicron.mobile.resources.profile_unblock
import org.omicron.mobile.resources.profile_unmute
import org.omicron.mobile.resources.profile_requested
import org.omicron.mobile.resources.profile_joined
import org.omicron.mobile.resources.profile_loading
import org.omicron.mobile.resources.timeline_session_expired
import org.omicron.mobile.resources.timeline_untitled
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun ProfileRoute(
    viewModel: ProfileViewModel,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenManage: () -> Unit = {},
) {
    val state by viewModel.uiState.collectAsState()
    ProfileScreen(
        state = state,
        onBack = onBack,
        onRetry = viewModel::retry,
        onSelectTab = viewModel::selectTab,
        onLoadMore = viewModel::loadMore,
        onSignIn = onSignIn,
        onOpenPost = onOpenPost,
        onOpenProfile = onOpenProfile,
        onOpenManage = onOpenManage,
        onToggleFollow = viewModel::toggleFollow,
        onToggleMute = viewModel::toggleMute,
        onToggleBlock = viewModel::toggleBlock,
    )
}

@Composable
private fun ProfileScreen(
    state: ProfileUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onSelectTab: (ProfileTab) -> Unit,
    onLoadMore: () -> Unit,
    onSignIn: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenManage: () -> Unit,
    onToggleFollow: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleBlock: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
    ) {
        Row(
            modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                icon = RikkaIcons.ArrowLeft,
                contentDescription = stringResource(Res.string.profile_back),
                onClick = onBack,
                size = org.omicron.mobile.core.designsystem.rikkaui.button.IconButtonSize.Default,
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Image(painter = painterResource(Res.drawable.omicron_logo), contentDescription = null, modifier = Modifier.size(24.dp))
                Text(text = stringResource(Res.string.app_name), variant = TextVariant.Small)
            }
            Box(modifier = Modifier.size(40.dp))
        }
        if (state.sessionExpired) {
            SessionExpiredNotice(
                message = stringResource(Res.string.timeline_session_expired),
                onSignIn = onSignIn,
            )
        }
        when (val phase = state.phase) {
            ProfilePhase.Loading ->
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.profile_loading))
                }
            ProfilePhase.NotFound -> ProfileMessage(stringResource(Res.string.profile_not_found), null, onAction = onBack)
            is ProfilePhase.Error -> {
                val message =
                    when (phase.reason) {
                        ProfileLoadError.Offline -> stringResource(Res.string.profile_error_offline)
                        ProfileLoadError.Server -> stringResource(Res.string.profile_error_server)
                    }
                ProfileMessage(
                    title = message,
                    description = null,
                    actionLabel = stringResource(Res.string.profile_retry),
                    onAction = onRetry,
                )
            }
            ProfilePhase.Content -> {
                val profile = state.profile ?: return@Column
                ProfileContent(
                    state = state,
                    profile = profile,
                    onRetry = onRetry,
                    onSelectTab = onSelectTab,
                    onLoadMore = onLoadMore,
                    onSignIn = onSignIn,
                    onOpenPost = onOpenPost,
                    onOpenProfile = onOpenProfile,
                    onOpenManage = onOpenManage,
                    onToggleFollow = onToggleFollow,
                    onToggleMute = onToggleMute,
                    onToggleBlock = onToggleBlock,
                )
            }
        }
    }
}

@Composable
private fun ProfileContent(
    state: ProfileUiState,
    profile: Profile,
    onRetry: () -> Unit,
    onSelectTab: (ProfileTab) -> Unit,
    onLoadMore: () -> Unit,
    onSignIn: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenManage: () -> Unit,
    onToggleFollow: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleBlock: () -> Unit,
) {
    val articleEmpty = stringResource(Res.string.profile_empty_articles)
    val recommendationEmpty = stringResource(Res.string.profile_empty_recommendations)
    val contentError = stringResource(Res.string.profile_content_error)
    val retryLabel = stringResource(Res.string.profile_retry)
    val noFollowers = stringResource(Res.string.profile_no_followers)
    val noFollowing = stringResource(Res.string.profile_no_following)
    LazyColumn(
        modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "profile-header", contentType = "profile-header") {
            ProfileHeader(
                state = state,
                profile = profile,
                onSelectTab = onSelectTab,
                onOpenManage = onOpenManage,
                onSignIn = onSignIn,
                onToggleFollow = onToggleFollow,
                onToggleMute = onToggleMute,
                onToggleBlock = onToggleBlock,
            )
        }
        item(key = "profile-tabs", contentType = "profile-tabs") {
            ProfileTabs(profile = profile, selected = state.selectedTab, onSelectTab = onSelectTab)
        }
        when (state.selectedTab) {
            ProfileTab.Articles -> {
                if (profile.locked) {
                    item(key = "private", contentType = "empty") {
                        ProfileMessage(
                            title = stringResource(Res.string.profile_private_title),
                            description = stringResource(Res.string.profile_private_description),
                            onAction = {},
                        )
                    }
                } else {
                    profilePostItems(
                        keyPrefix = "article",
                        posts = state.articles.posts,
                        loading = state.articles.loading,
                        error = state.articles.error,
                        cursor = state.articles.cursor,
                        loadMoreError = state.loadMoreError,
                        emptyText = articleEmpty,
                        contentError = contentError,
                        retryLabel = retryLabel,
                        onRetry = onRetry,
                        onLoadMore = onLoadMore,
                        onOpenPost = onOpenPost,
                    )
                }
            }
            ProfileTab.Recommendations -> {
                profilePostItems(
                    keyPrefix = "recommendation",
                    posts = state.recommendations.posts,
                    loading = state.recommendations.loading,
                    error = state.recommendations.error,
                    cursor = state.recommendations.cursor,
                    loadMoreError = state.loadMoreError,
                    emptyText = recommendationEmpty,
                    contentError = contentError,
                    retryLabel = retryLabel,
                    onRetry = onRetry,
                    onLoadMore = onLoadMore,
                    onOpenPost = onOpenPost,
                )
            }
            ProfileTab.Followers, ProfileTab.Following ->
                profileMembers(
                    state = state,
                    onRetry = onRetry,
                    onOpenProfile = onOpenProfile,
                    errorText = contentError,
                    retryLabel = retryLabel,
                    emptyText = if (state.selectedTab == ProfileTab.Followers) noFollowers else noFollowing,
                )
            ProfileTab.About -> item(key = "profile-about", contentType = "profile-about") { ProfileAbout(profile) }
        }
    }
}

@Composable
private fun ProfileHeader(
    state: ProfileUiState,
    profile: Profile,
    onSelectTab: (ProfileTab) -> Unit,
    onOpenManage: () -> Unit,
    onSignIn: () -> Unit,
    onToggleFollow: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleBlock: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            ProfileAvatar(name = profile.user.displayName, url = profile.user.avatarUrl, size = 64)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(text = profile.user.displayName, variant = TextVariant.H2, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(text = "@${profile.user.username}", variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
                profile.user.host?.let { Text(text = it, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground) }
            }
        }
        if (profile.user.bio.isNotBlank()) Text(text = profile.user.bio, variant = TextVariant.P)
        if (profile.user.tags.isNotEmpty()) {
            Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                profile.user.tags.forEach { tag ->
                    Text(
                        text = "#${tag.name}",
                        variant = TextVariant.Small,
                        modifier = Modifier.clip(RikkaTheme.shapes.full).background(RikkaTheme.colors.muted).padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
            if (!profile.remote && !profile.locked) {
                Button(
                    text = stringResource(Res.string.profile_followers, profile.followerCount),
                    onClick = { onSelectTab(ProfileTab.Followers) },
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Sm,
                )
                Button(
                    text = stringResource(Res.string.profile_following_count, profile.followingCount),
                    onClick = { onSelectTab(ProfileTab.Following) },
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Sm,
                )
            } else {
                Text(text = stringResource(Res.string.profile_followers, profile.followerCount), variant = TextVariant.Small)
                Text(text = stringResource(Res.string.profile_following_count, profile.followingCount), variant = TextVariant.Small)
            }
        }
        if (state.isSelf) {
            Button(
                text = stringResource(Res.string.manage_open),
                onClick = onOpenManage,
                variant = ButtonVariant.Outline,
                size = ButtonSize.Lg,
            )
        }
        if (!state.isSelf) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (!state.signedIn) {
                    Button(
                        text = stringResource(Res.string.profile_sign_in_to_follow),
                        onClick = onSignIn,
                        size = ButtonSize.Lg,
                    )
                } else {
                    val followLabel =
                        when (profile.followState) {
                            ProfileFollowState.None -> stringResource(Res.string.profile_follow)
                            ProfileFollowState.Requested -> stringResource(Res.string.profile_requested)
                            ProfileFollowState.Following -> stringResource(Res.string.profile_following)
                        }
                    Button(
                        text = followLabel,
                        onClick = onToggleFollow,
                        enabled = !state.followBusy && !state.relationBusy,
                        loading = state.followBusy,
                        size = ButtonSize.Lg,
                        variant = if (profile.followState == ProfileFollowState.None) ButtonVariant.Default else ButtonVariant.Outline,
                    )
                    Button(
                        text = stringResource(if (profile.isMuted) Res.string.profile_unmute else Res.string.profile_mute),
                        onClick = onToggleMute,
                        enabled = !state.followBusy && !state.relationBusy,
                        loading = state.relationBusy,
                        size = ButtonSize.Lg,
                        variant = ButtonVariant.Outline,
                    )
                    Button(
                        text = stringResource(if (profile.isBlocked) Res.string.profile_unblock else Res.string.profile_block),
                        onClick = onToggleBlock,
                        enabled = !state.followBusy && !state.relationBusy,
                        loading = state.relationBusy,
                        size = ButtonSize.Lg,
                        variant = ButtonVariant.Destructive,
                    )
                }
            }
        }
        state.relationError?.let { error ->
            val message =
                when (error) {
                    ProfileRelationError.Follow -> stringResource(Res.string.profile_relation_error_follow)
                    ProfileRelationError.Mute -> stringResource(Res.string.profile_relation_error_mute)
                    ProfileRelationError.Block -> stringResource(Res.string.profile_relation_error_block)
                }
            Text(text = message, variant = TextVariant.Small, color = RikkaTheme.colors.destructive)
        }
    }
}

@Composable
private fun ProfileTabs(
    profile: Profile,
    selected: ProfileTab,
    onSelectTab: (ProfileTab) -> Unit,
) {
    val tabs =
        buildList {
            add(ProfileTab.Articles)
            if (!profile.locked) add(ProfileTab.Recommendations)
            if (!profile.remote && !profile.locked) {
                add(ProfileTab.Followers)
                add(ProfileTab.Following)
            }
            add(ProfileTab.About)
        }
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        tabs.forEach { tab ->
            val label =
                when (tab) {
                    ProfileTab.Articles -> Res.string.profile_articles
                    ProfileTab.Recommendations -> Res.string.profile_recommendations
                    ProfileTab.Followers -> Res.string.profile_followers
                    ProfileTab.Following -> Res.string.profile_following_count
                    ProfileTab.About -> Res.string.profile_about
                }
            val text =
                when (tab) {
                    ProfileTab.Followers -> stringResource(label, profile.followerCount)
                    ProfileTab.Following -> stringResource(label, profile.followingCount)
                    else -> stringResource(label)
                }
            Button(
                text = text,
                onClick = { onSelectTab(tab) },
                size = ButtonSize.Sm,
                variant = if (tab == selected) ButtonVariant.Secondary else ButtonVariant.Ghost,
            )
        }
    }
}

private fun LazyListScope.profilePostItems(
    keyPrefix: String,
    posts: List<Post>,
    loading: Boolean,
    error: ProfileContentError?,
    cursor: String?,
    loadMoreError: ProfileContentError?,
    emptyText: String,
    contentError: String,
    retryLabel: String,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    when {
        loading && posts.isEmpty() ->
            item(key = "$keyPrefix-loading", contentType = "loading") {
                Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    Spinner(size = SpinnerSize.Default, label = stringResource(Res.string.profile_loading_more))
                }
            }
        error != null && posts.isEmpty() ->
            item(key = "$keyPrefix-error", contentType = "error") {
                ProfileMessage(
                    title = contentError,
                    description = null,
                    actionLabel = retryLabel,
                    onAction = onRetry,
                )
            }
        posts.isEmpty() -> item(key = "$keyPrefix-empty", contentType = "empty") { ProfileMessage(emptyText, null, onAction = {}) }
        else -> {
            items(items = posts, key = { post -> "$keyPrefix-${post.id}" }, contentType = { "profile-post" }) { post ->
                ProfilePostCard(post = post, onOpen = { onOpenPost(post.id) })
            }
            if (cursor != null) {
                item(key = "$keyPrefix-load-more", contentType = "load-more") {
                    Column(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        if (loading) {
                            Spinner(size = SpinnerSize.Sm, label = stringResource(Res.string.profile_loading_more))
                        } else {
                            if (loadMoreError != null) Text(text = stringResource(Res.string.profile_content_error), variant = TextVariant.Small)
                            Button(
                                text = stringResource(Res.string.profile_load_more),
                                onClick = onLoadMore,
                                size = ButtonSize.Lg,
                                variant = ButtonVariant.Outline,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfilePostCard(
    post: Post,
    onOpen: () -> Unit,
) {
    val preview = remember(post.summary, post.contentHtml) { postPreview(post.summary, post.contentHtml) }
    Column(
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onOpen).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(text = post.title?.ifBlank { null } ?: stringResource(Res.string.timeline_untitled), variant = TextVariant.H3, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (preview.excerpt.isNotBlank()) Text(text = preview.excerpt, variant = TextVariant.P, maxLines = 3, overflow = TextOverflow.Ellipsis)
        Text(text = "${post.author.displayName} · ${post.likeCount} · ${post.commentCount}", variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
    }
}

private fun LazyListScope.profileMembers(
    state: ProfileUiState,
    onRetry: () -> Unit,
    onOpenProfile: (String) -> Unit,
    errorText: String,
    retryLabel: String,
    emptyText: String,
) {
    when {
        state.membersLoading ->
            item(key = "members-loading", contentType = "loading") {
                Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    Spinner(size = SpinnerSize.Default, label = stringResource(Res.string.profile_loading_more))
                }
            }
        state.membersError != null ->
            item(key = "members-error", contentType = "error") {
                ProfileMessage(
                    title = errorText,
                    description = null,
                    actionLabel = retryLabel,
                    onAction = onRetry,
                )
            }
        state.members.isEmpty() -> {
            item(key = "members-empty", contentType = "empty") { ProfileMessage(emptyText, null, onAction = {}) }
        }
        else ->
            items(items = state.members, key = { actor -> actor.id }, contentType = { "profile-member" }) { actor ->
                ProfileMember(actor = actor, onOpen = { onOpenProfile(actor.username) })
            }
    }
}

@Composable
private fun ProfileMember(
    actor: RelationActor,
    onOpen: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onOpen).padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProfileAvatar(name = actor.displayName, url = actor.avatarUrl, size = 42)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = actor.displayName, variant = TextVariant.P, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(text = "@${actor.username}", variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ProfileAbout(profile: Profile) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (profile.user.bio.isNotBlank()) Text(text = profile.user.bio, variant = TextVariant.P)
        if (profile.user.links.isNotEmpty()) {
            profile.user.links.forEach { link -> Text(text = "${link.label}: ${link.url}", variant = TextVariant.Small) }
        }
        if (profile.user.createdAt.isNotBlank()) {
            Text(text = stringResource(Res.string.profile_joined, profile.user.createdAt.take(10)), variant = TextVariant.Small)
        }
        profile.user.profileUrl?.let { Text(text = it, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground) }
    }
}

@Composable
private fun ProfileAvatar(
    name: String,
    url: String?,
    size: Int,
) {
    val shape = RikkaTheme.shapes.full
    Box(
        modifier = Modifier.size(size.dp).clip(shape).background(RikkaTheme.colors.muted).border(1.dp, OmicronTheme.colors.borderCard, shape),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = name.trim().firstOrNull()?.uppercase() ?: "?", variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
        if (url != null) AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(shape))
    }
}

@Composable
private fun ProfileMessage(
    title: String,
    description: String?,
    actionLabel: String? = null,
    onAction: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = title, variant = TextVariant.H3)
        if (description != null) Text(text = description, variant = TextVariant.Muted)
        if (actionLabel != null) Button(text = actionLabel, onClick = onAction, size = ButtonSize.Lg)
    }
}
