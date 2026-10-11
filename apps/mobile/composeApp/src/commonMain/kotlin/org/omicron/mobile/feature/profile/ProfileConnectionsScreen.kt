package org.omicron.mobile.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.SessionExpiredNotice
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButton
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.separator.Separator
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.tabs.Tab
import org.omicron.mobile.core.designsystem.rikkaui.tabs.TabList
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.RelationActor
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.profile_connections_back
import org.omicron.mobile.resources.profile_connections_error
import org.omicron.mobile.resources.profile_connections_loading
import org.omicron.mobile.resources.profile_connections_private
import org.omicron.mobile.resources.profile_error_offline
import org.omicron.mobile.resources.profile_followers
import org.omicron.mobile.resources.profile_following_count
import org.omicron.mobile.resources.profile_no_followers
import org.omicron.mobile.resources.profile_no_following
import org.omicron.mobile.resources.profile_not_found
import org.omicron.mobile.resources.profile_private_title
import org.omicron.mobile.resources.profile_retry
import org.omicron.mobile.resources.timeline_session_expired

@Composable
fun ProfileConnectionsRoute(
    viewModel: ProfileConnectionsViewModel,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onTabSelected: (ProfileConnectionsTab) -> Unit = {},
) {
    val state by viewModel.uiState.collectAsState()
    ProfileConnectionsScreen(
        state = state,
        onBack = onBack,
        onSelectTab = { tab ->
            viewModel.selectTab(tab)
            onTabSelected(tab)
        },
        onRetry = viewModel::retry,
        onSignIn = onSignIn,
        onOpenProfile = onOpenProfile,
    )
}

@Composable
internal fun ProfileConnectionsScreen(
    state: ProfileConnectionsUiState,
    onBack: () -> Unit,
    onSelectTab: (ProfileConnectionsTab) -> Unit,
    onRetry: () -> Unit,
    onSignIn: () -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxWidth().weight(1f)) content@{
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    icon = RikkaIcons.ArrowLeft,
                    contentDescription = stringResource(Res.string.profile_connections_back),
                    onClick = onBack,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = state.username,
                    variant = TextVariant.H2,
                    style = TextStyle(fontSize = 20.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
            }
            if (state.sessionExpired) {
                SessionExpiredNotice(message = stringResource(Res.string.timeline_session_expired), onSignIn = onSignIn)
            }
            when (val phase = state.phase) {
                ProfilePhase.Loading -> ConnectionsLoading()
                ProfilePhase.NotFound -> ProfileMessage(stringResource(Res.string.profile_not_found), null, onAction = {})
                is ProfilePhase.Error -> ConnectionsError(phase.reason, onRetry)
                ProfilePhase.Content -> {
                    val profile = state.profile ?: return@content
                    TabList(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp)) {
                        ProfileConnectionsTab.entries.forEach { tab ->
                            Tab(
                                text = stringResource(
                                    if (tab == ProfileConnectionsTab.Followers) Res.string.profile_followers else Res.string.profile_following_count,
                                    if (tab == ProfileConnectionsTab.Followers) profile.followerCount else profile.followingCount,
                                ),
                                onClick = { onSelectTab(tab) },
                                selected = state.selectedTab == tab,
                            )
                        }
                    }
                    Separator()
                    if (profile.locked) {
                        ProfileMessage(
                            title = stringResource(Res.string.profile_private_title),
                            description = stringResource(Res.string.profile_connections_private),
                            icon = RikkaIcons.Lock,
                            onAction = {},
                        )
                    } else {
                        ConnectionsMembers(state, onRetry, onOpenProfile, Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun ConnectionsMembers(
    state: ProfileConnectionsUiState,
    onRetry: () -> Unit,
    onOpenProfile: (String) -> Unit,
    modifier: Modifier,
) {
    val members = state.selectedMembers
    val followersScroll = rememberLazyListState()
    val followingScroll = rememberLazyListState()
    when {
        members.loading -> ConnectionsLoading()
        members.error != null -> ConnectionsError(members.error, onRetry)
        members.items.isEmpty() -> ProfileMessage(
            title = stringResource(if (state.selectedTab == ProfileConnectionsTab.Followers) Res.string.profile_no_followers else Res.string.profile_no_following),
            description = null,
            onAction = {},
        )
        else -> key(state.selectedTab) {
            LazyColumn(
                modifier = modifier.fillMaxWidth(),
                state = if (state.selectedTab == ProfileConnectionsTab.Followers) followersScroll else followingScroll,
                contentPadding = PaddingValues(vertical = 8.dp),
            ) {
                items(members.items, key = RelationActor::id, contentType = { "profile-member" }) { actor ->
                    ConnectionMember(actor, onOpen = { onOpenProfile(actor.username) })
                }
            }
        }
    }
}

@Composable
private fun ConnectionMember(actor: RelationActor, onOpen: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(role = Role.Button, onClick = onOpen).padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProfileAvatar(name = actor.displayName, url = actor.avatarUrl, size = 48)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = "@${actor.username}", variant = TextVariant.P, maxLines = 1, overflow = TextOverflow.Ellipsis, style = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold))
            Text(text = actor.displayName, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ConnectionsLoading() {
    Box(modifier = Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
        Spinner(size = SpinnerSize.Default, label = stringResource(Res.string.profile_connections_loading))
    }
}

@Composable
private fun ConnectionsError(error: ProfileLoadError, onRetry: () -> Unit) {
    ProfileMessage(
        title = stringResource(if (error == ProfileLoadError.Offline) Res.string.profile_error_offline else Res.string.profile_connections_error),
        description = null,
        actionLabel = stringResource(Res.string.profile_retry),
        onAction = onRetry,
    )
}
