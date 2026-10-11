package org.omicron.mobile.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.SessionExpiredNotice
import org.omicron.mobile.core.designsystem.rikkaui.avatar.Avatar
import org.omicron.mobile.core.designsystem.rikkaui.badge.Badge
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButton
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.card.Card
import org.omicron.mobile.core.designsystem.rikkaui.dropdown.DropdownMenu
import org.omicron.mobile.core.designsystem.rikkaui.dropdown.DropdownMenuItem
import org.omicron.mobile.core.designsystem.rikkaui.dropdown.DropdownMenuSeparator
import org.omicron.mobile.core.designsystem.rikkaui.separator.Separator
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.core.designsystem.rikkaui.tabs.Tab
import org.omicron.mobile.core.designsystem.rikkaui.tabs.TabList
import org.omicron.mobile.core.article.postPreview
import org.omicron.mobile.core.time.displayDate
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.Profile
import org.omicron.mobile.domain.model.ProfileFollowState
import org.omicron.mobile.domain.model.RelationActor
import org.omicron.mobile.feature.navigation.AccountAction
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.navigation_account_menu
import org.omicron.mobile.resources.navigation_settings
import org.omicron.mobile.resources.navigation_sign_out
import org.omicron.mobile.resources.navigation_your_posts
import org.omicron.mobile.resources.profile_about
import org.omicron.mobile.resources.profile_address
import org.omicron.mobile.resources.profile_link_error
import org.omicron.mobile.resources.profile_links
import org.omicron.mobile.resources.profile_more_actions
import org.omicron.mobile.resources.profile_followers_label
import org.omicron.mobile.resources.profile_following_label
import org.omicron.mobile.resources.profile_view_original
import org.omicron.mobile.resources.profile_likes
import org.omicron.mobile.resources.profile_responses
import org.omicron.mobile.resources.profile_recommendation_count
import org.omicron.mobile.resources.manage_open
import org.omicron.mobile.resources.profile_articles
import org.omicron.mobile.resources.profile_block
import org.omicron.mobile.resources.profile_content_error
import org.omicron.mobile.resources.profile_empty_articles
import org.omicron.mobile.resources.profile_empty_recommendations
import org.omicron.mobile.resources.profile_error_offline
import org.omicron.mobile.resources.profile_error_server
import org.omicron.mobile.resources.profile_follow
import org.omicron.mobile.resources.profile_following
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
import org.omicron.mobile.resources.timeline_reading_time
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun ProfileRoute(
    viewModel: ProfileViewModel,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenManage: () -> Unit = {},
    onAccountAction: (AccountAction) -> Unit = {},
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
        onAccountAction = onAccountAction,
        onToggleFollow = viewModel::toggleFollow,
        onToggleMute = viewModel::toggleMute,
        onToggleBlock = viewModel::toggleBlock,
    )
}

@Composable
internal fun ProfileScreen(
    state: ProfileUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onSelectTab: (ProfileTab) -> Unit,
    onLoadMore: () -> Unit,
    onSignIn: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenManage: () -> Unit,
    onAccountAction: (AccountAction) -> Unit,
    onToggleFollow: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleBlock: () -> Unit,
    onOpenLink: ((String) -> Unit)? = null,
) {
    val uriHandler = LocalUriHandler.current
    var linkFailed by remember(state.profile?.user?.id) { mutableStateOf(false) }
    val openLink: (String) -> Unit = { url ->
        linkFailed = runCatching { if (onOpenLink != null) onOpenLink(url) else uriHandler.openUri(url) }.isFailure
    }
    Column(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
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
                    onAccountAction = onAccountAction,
                    onToggleFollow = onToggleFollow,
                    onToggleMute = onToggleMute,
                    onToggleBlock = onToggleBlock,
                    onOpenLink = openLink,
                    linkFailed = linkFailed,
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
    onAccountAction: (AccountAction) -> Unit,
    onToggleFollow: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleBlock: () -> Unit,
    onOpenLink: (String) -> Unit,
    linkFailed: Boolean,
) {
    val articleEmpty = stringResource(Res.string.profile_empty_articles)
    val recommendationEmpty = stringResource(Res.string.profile_empty_recommendations)
    val contentError = stringResource(Res.string.profile_content_error)
    val retryLabel = stringResource(Res.string.profile_retry)
    val noFollowers = stringResource(Res.string.profile_no_followers)
    val noFollowing = stringResource(Res.string.profile_no_following)
    LazyColumn(
        modifier = Modifier.widthIn(max = 600.dp).fillMaxWidth(),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item(key = "profile-menu", contentType = "profile-menu") {
            ProfileMenuBar(
                username = profile.user.username,
                isSelf = state.isSelf,
                signedIn = state.signedIn,
                onAction = onAccountAction,
            )
        }
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
        if (linkFailed) {
            item(key = "profile-link-error", contentType = "error") {
                Text(
                    text = stringResource(Res.string.profile_link_error),
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.destructive,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                )
            }
        }
        when (state.selectedTab) {
            ProfileTab.Articles -> {
                if (profile.locked) {
                    item(key = "private", contentType = "empty") {
                        Card(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                            ProfileMessage(
                                title = stringResource(Res.string.profile_private_title),
                                description = stringResource(Res.string.profile_private_description),
                                icon = RikkaIcons.Lock,
                                onAction = {},
                            )
                        }
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
            ProfileTab.About -> item(key = "profile-about", contentType = "profile-about") { ProfileAbout(profile, onOpenLink) }
        }
    }
}

@Composable
fun ProfileMenuBar(
    username: String,
    isSelf: Boolean,
    signedIn: Boolean,
    onAction: (AccountAction) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val menuLabel = stringResource(Res.string.navigation_account_menu)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = username,
            variant = TextVariant.P,
            style = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
            color = OmicronTheme.colors.foreground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        DropdownMenu(
            expanded = expanded,
            onDismiss = { expanded = false },
            label = menuLabel,
            trigger = {
                IconButton(
                    icon = RikkaIcons.Menu,
                    contentDescription = menuLabel,
                    onClick = { expanded = true },
                    modifier = Modifier.size(48.dp),
                    size = IconButtonSize.Default,
                )
            },
        ) {
            if (isSelf) {
                DropdownMenuItem(text = stringResource(Res.string.navigation_your_posts), icon = RikkaIcons.FileStack, onClick = {
                    expanded = false
                    onAction(AccountAction.YourPosts)
                })
                DropdownMenuSeparator()
            }
            DropdownMenuItem(text = stringResource(Res.string.navigation_settings), icon = RikkaIcons.Settings, onClick = {
                expanded = false
                onAction(AccountAction.Settings)
            })
            if (signedIn) {
                DropdownMenuSeparator()
                DropdownMenuItem(text = stringResource(Res.string.navigation_sign_out), icon = RikkaIcons.LogOut, onClick = {
                    expanded = false
                    onAction(AccountAction.SignOut)
                })
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
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
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
            ProfileAvatar(name = profile.user.displayName, url = profile.user.avatarUrl, size = 72)
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                ProfileActions(state, profile, onOpenManage, onSignIn, onToggleFollow, onToggleMute, onToggleBlock)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = profile.user.displayName,
                variant = TextVariant.H2,
                modifier = Modifier.fillMaxWidth().semantics { heading() },
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold),
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "@${profile.user.username.substringBefore('@')}",
                    variant = TextVariant.P,
                    color = OmicronTheme.colors.mutedForeground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
                )
                profile.user.host?.let { host ->
                    Badge {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(imageVector = RikkaIcons.Globe, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Xs)
                            Text(text = host, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        if (profile.user.bio.isNotBlank()) {
            Text(
                text = profile.user.bio,
                variant = TextVariant.P,
                color = OmicronTheme.colors.foregroundAlt,
                style = TextStyle(fontFamily = OmicronTheme.contentFontFamily, fontSize = 16.sp, lineHeight = 24.sp),
            )
        }
        if (profile.user.tags.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                profile.user.tags.forEach { tag ->
                    Badge {
                        Text(text = "#${tag.name}", variant = TextVariant.Small, color = OmicronTheme.colors.foregroundAlt)
                    }
                }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            ProfileCount(
                count = profile.followerCount,
                label = stringResource(Res.string.profile_followers_label),
                onClick = if (!profile.remote && !profile.locked) ({ onSelectTab(ProfileTab.Followers) }) else null,
            )
            ProfileCount(
                count = profile.followingCount,
                label = stringResource(Res.string.profile_following_label),
                onClick = if (!profile.remote && !profile.locked) ({ onSelectTab(ProfileTab.Following) }) else null,
            )
        }
        state.relationError?.let { error ->
            val message =
                when (error) {
                    ProfileRelationError.Follow -> stringResource(Res.string.profile_relation_error_follow)
                    ProfileRelationError.Mute -> stringResource(Res.string.profile_relation_error_mute)
                    ProfileRelationError.Block -> stringResource(Res.string.profile_relation_error_block)
                }
            Text(text = message, variant = TextVariant.Small, color = OmicronTheme.colors.destructive)
        }
    }
}

@Composable
private fun ProfileCount(count: Int, label: String, onClick: (() -> Unit)?) {
    val modifier = if (onClick == null) Modifier else Modifier.clickable(role = Role.Button, onClick = onClick)
    Row(
        modifier = modifier.heightIn(min = 48.dp).semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = count.toString(), variant = TextVariant.Small, color = OmicronTheme.colors.foreground, style = TextStyle(fontWeight = FontWeight.SemiBold))
        Text(text = label, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProfileActions(
    state: ProfileUiState,
    profile: Profile,
    onOpenManage: () -> Unit,
    onSignIn: () -> Unit,
    onToggleFollow: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleBlock: () -> Unit,
) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), verticalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
        when {
            state.isSelf -> Button(text = stringResource(Res.string.manage_open), onClick = onOpenManage, modifier = Modifier.heightIn(min = 48.dp), variant = ButtonVariant.Outline, size = ButtonSize.Sm)
            !state.signedIn -> Button(text = stringResource(Res.string.profile_sign_in_to_follow), onClick = onSignIn, modifier = Modifier.heightIn(min = 48.dp), size = ButtonSize.Sm)
            else -> {
                val followLabel = when (profile.followState) {
                    ProfileFollowState.None -> stringResource(Res.string.profile_follow)
                    ProfileFollowState.Requested -> stringResource(Res.string.profile_requested)
                    ProfileFollowState.Following -> stringResource(Res.string.profile_following)
                }
                Button(
                    text = followLabel,
                    onClick = onToggleFollow,
                    modifier = Modifier.heightIn(min = 48.dp),
                    enabled = !state.followBusy && !state.relationBusy,
                    loading = state.followBusy,
                    size = ButtonSize.Sm,
                    variant = if (profile.followState == ProfileFollowState.None) ButtonVariant.Default else ButtonVariant.Outline,
                )
                ProfileRelationMenu(state, profile, onToggleMute, onToggleBlock)
            }
        }
    }
}

@Composable
private fun ProfileRelationMenu(state: ProfileUiState, profile: Profile, onToggleMute: () -> Unit, onToggleBlock: () -> Unit) {
    var expanded by remember(profile.user.id) { mutableStateOf(false) }
    val enabled = !state.followBusy && !state.relationBusy
    val label = stringResource(Res.string.profile_more_actions)
    DropdownMenu(
        expanded = expanded,
        onDismiss = { expanded = false },
        label = label,
        trigger = {
            IconButton(
                icon = RikkaIcons.MoreHorizontal,
                contentDescription = label,
                onClick = { expanded = true },
                enabled = enabled,
                modifier = Modifier.size(48.dp).border(1.dp, OmicronTheme.colors.borderInput, RikkaTheme.shapes.full),
            )
        },
    ) {
        DropdownMenuItem(text = stringResource(if (profile.isMuted) Res.string.profile_unmute else Res.string.profile_mute), icon = RikkaIcons.VolumeX, enabled = enabled, onClick = {
            expanded = false
            onToggleMute()
        })
        DropdownMenuItem(text = stringResource(if (profile.isBlocked) Res.string.profile_unblock else Res.string.profile_block), icon = RikkaIcons.Ban, enabled = enabled, color = OmicronTheme.colors.destructive, onClick = {
            expanded = false
            onToggleBlock()
        })
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
            add(ProfileTab.About)
            if (!profile.remote && !profile.locked) {
                add(ProfileTab.Followers)
                add(ProfileTab.Following)
            }
        }
    Column {
        TabList(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp)) {
            tabs.forEach { tab ->
                val label =
                    when (tab) {
                        ProfileTab.Articles -> Res.string.profile_articles
                        ProfileTab.Recommendations -> Res.string.profile_recommendations
                        ProfileTab.Followers -> Res.string.profile_followers_label
                        ProfileTab.Following -> Res.string.profile_following_label
                        ProfileTab.About -> Res.string.profile_about
                    }
                Tab(
                    text = stringResource(label),
                    onClick = { onSelectTab(tab) },
                    selected = tab == selected,
                )
            }
        }
        Separator()
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProfilePostCard(
    post: Post,
    onOpen: () -> Unit,
) {
    val preview = remember(post.summary, post.contentHtml) { postPreview(post.summary, post.contentHtml) }
    var coverFailed by remember(post.bannerUrl) { mutableStateOf(false) }
    Column(
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onOpen).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            ProfileAvatar(name = post.author.displayName, url = post.author.avatarUrl, size = 24)
            Text(
                text = post.author.displayName,
                variant = TextVariant.Small,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
                style = TextStyle(fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium),
            )
            if (post.createdAt.isNotBlank()) {
                Text(text = displayDate(post.createdAt), variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, style = TextStyle(fontSize = 12.sp, lineHeight = 16.sp))
            }
        }
        BoxWithConstraints {
            val thumbnailSize = minOf(80.dp, maxWidth * 0.25f)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = post.title?.ifBlank { null } ?: stringResource(Res.string.timeline_untitled),
                        variant = TextVariant.H3,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        style = TextStyle(fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.Bold),
                    )
                    if (preview.excerpt.isNotBlank()) {
                        Text(
                            text = preview.excerpt,
                            variant = TextVariant.P,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            color = OmicronTheme.colors.mutedForeground,
                            style = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
                        )
                    }
                }
                if (!post.bannerUrl.isNullOrBlank() && !coverFailed) {
                    AsyncImage(
                        model = post.bannerUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        onError = { coverFailed = true },
                        modifier = Modifier.size(thumbnailSize).clip(RikkaTheme.shapes.md).border(1.dp, OmicronTheme.colors.borderCard, RikkaTheme.shapes.md),
                    )
                }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            ProfilePostMeta(RikkaIcons.Clock, stringResource(Res.string.timeline_reading_time, preview.readingMinutes))
            ProfilePostMeta(RikkaIcons.Heart, post.likeCount.toString(), stringResource(Res.string.profile_likes, post.likeCount))
            ProfilePostMeta(RikkaIcons.MessageCircle, post.commentCount.toString(), stringResource(Res.string.profile_responses, post.commentCount))
            ProfilePostMeta(RikkaIcons.Recommend, post.recommendCount.toString(), stringResource(Res.string.profile_recommendation_count, post.recommendCount))
        }
    }
    Separator(modifier = Modifier.padding(horizontal = 16.dp))
}

@Composable
private fun ProfilePostMeta(icon: ImageVector, text: String, description: String? = null) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(imageVector = icon, contentDescription = description, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Xs)
        Text(text = text, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, style = TextStyle(fontSize = 12.sp, lineHeight = 16.sp))
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
            Text(text = actor.displayName, variant = TextVariant.P, maxLines = 1, overflow = TextOverflow.Ellipsis, style = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium))
            Text(text = "@${actor.username}", variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(imageVector = RikkaIcons.ChevronRight, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Sm)
    }
    Separator(modifier = Modifier.padding(horizontal = 16.dp))
}

@Composable
private fun ProfileAbout(profile: Profile, onOpenLink: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (profile.user.bio.isNotBlank()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Text(text = profile.user.bio, variant = TextVariant.P, modifier = Modifier.padding(16.dp), color = OmicronTheme.colors.foregroundAlt, style = TextStyle(fontFamily = OmicronTheme.contentFontFamily, fontSize = 16.sp, lineHeight = 24.sp))
            }
        }
        if (profile.user.links.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(text = stringResource(Res.string.profile_links), variant = TextVariant.Small, modifier = Modifier.semantics { heading() }, style = TextStyle(fontWeight = FontWeight.SemiBold))
                Card(modifier = Modifier.fillMaxWidth()) {
                    profile.user.links.forEachIndexed { index, link ->
                        if (index > 0) Separator()
                        ProfileLinkRow(label = link.label.ifBlank { link.url.substringAfter("://").substringBefore('/') }, value = link.url, onClick = { onOpenLink(link.url) })
                    }
                }
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            ProfileDetailRow(icon = RikkaIcons.User, label = stringResource(Res.string.profile_address), value = "@${profile.user.username}")
            if (profile.user.createdAt.isNotBlank()) {
                Separator()
                ProfileDetailRow(icon = RikkaIcons.Calendar, label = stringResource(Res.string.profile_joined, displayDate(profile.user.createdAt)), value = null)
            }
            profile.user.profileUrl?.let { url ->
                Separator()
                ProfileLinkRow(label = stringResource(Res.string.profile_view_original), value = url, onClick = { onOpenLink(url) })
            }
        }
    }
}

@Composable
private fun ProfileLinkRow(label: String, value: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(role = Role.Button, onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = RikkaIcons.Globe, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Sm)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = label, variant = TextVariant.Small, style = TextStyle(fontWeight = FontWeight.Medium))
            Text(text = value.removePrefix("https://").removePrefix("http://").trimEnd('/'), variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(imageVector = RikkaIcons.ChevronRight, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Sm)
    }
}

@Composable
private fun ProfileDetailRow(icon: ImageVector, label: String, value: String?) {
    Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(imageVector = icon, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Sm)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(text = label, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
            if (value != null) Text(text = value, variant = TextVariant.Small)
        }
    }
}

@Composable
private fun ProfileAvatar(
    name: String,
    url: String?,
    size: Int,
) {
    val initials = remember(name) { name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }.ifBlank { "?" } }
    Avatar(fallback = initials, size = size.dp) {
        if (!url.isNullOrBlank()) AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun ProfileMessage(
    title: String,
    description: String?,
    actionLabel: String? = null,
    icon: ImageVector? = null,
    onAction: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 40.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (icon != null) {
            Box(modifier = Modifier.size(48.dp).clip(RikkaTheme.shapes.full).background(OmicronTheme.colors.muted), contentAlignment = Alignment.Center) {
                Icon(imageVector = icon, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Lg)
            }
        }
        Text(text = title, variant = TextVariant.P, color = OmicronTheme.colors.mutedForeground, style = TextStyle(fontSize = 14.sp, lineHeight = 22.sp, textAlign = TextAlign.Center))
        if (description != null) Text(text = description, variant = TextVariant.Muted, style = TextStyle(textAlign = TextAlign.Center))
        if (actionLabel != null) Button(text = actionLabel, onClick = onAction, size = ButtonSize.Lg)
    }
}
