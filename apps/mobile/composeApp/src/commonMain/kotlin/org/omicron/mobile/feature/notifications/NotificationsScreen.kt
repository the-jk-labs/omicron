package org.omicron.mobile.feature.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.time.displayDate
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.MobileNotification
import org.omicron.mobile.feature.common.MobileFeatureError
import org.omicron.mobile.feature.common.notificationAction
import org.omicron.mobile.feature.common.notificationIcon
import org.omicron.mobile.feature.common.notificationSubject
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.notifications_empty
import org.omicron.mobile.resources.notifications_error_missing_instance
import org.omicron.mobile.resources.notifications_error_offline
import org.omicron.mobile.resources.notifications_error_server
import org.omicron.mobile.resources.notifications_load_more
import org.omicron.mobile.resources.notifications_loading
import org.omicron.mobile.resources.notifications_loading_more
import org.omicron.mobile.resources.notifications_read_retry
import org.omicron.mobile.resources.notifications_retry
import org.omicron.mobile.resources.notifications_retry_read
import org.omicron.mobile.resources.notifications_subtitle
import org.omicron.mobile.resources.notifications_title
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun NotificationsRoute(
    viewModel: NotificationsViewModel,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    LaunchedEffect(viewModel) { viewModel.loadIfNeeded() }
    NotificationsScreen(
        state = state,
        onOpenPost = onOpenPost,
        onOpenProfile = onOpenProfile,
        onRetry = viewModel::retry,
        onLoadMore = viewModel::loadMore,
        onRetryMarkAllRead = viewModel::retryMarkAllRead,
    )
}

@Composable
private fun NotificationsScreen(
    state: NotificationsUiState,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    onRetryMarkAllRead: () -> Unit,
) {
    when (state.phase) {
        NotificationsPhase.NotLoaded,
        NotificationsPhase.Loading,
        ->
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.notifications_loading))
            }
        NotificationsPhase.Error -> NotificationError(state.error ?: MobileFeatureError.Server, onRetry)
        NotificationsPhase.Empty ->
            Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
                NotificationsHeader()
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(Res.string.notifications_empty), variant = TextVariant.P, color = OmicronTheme.colors.mutedForeground)
                }
            }
        NotificationsPhase.Content ->
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 20.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                item(key = "notifications-header", contentType = "notifications-header") {
                    NotificationsHeader(modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
                }
                if (state.markReadError) {
                    item(key = "read-error", contentType = "read-error") {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(text = stringResource(Res.string.notifications_read_retry), variant = TextVariant.Small, color = OmicronTheme.colors.destructive)
                            Button(text = stringResource(Res.string.notifications_retry_read), onClick = onRetryMarkAllRead, size = ButtonSize.Sm, variant = ButtonVariant.Outline)
                        }
                    }
                }
                items(state.items, key = MobileNotification::id, contentType = { "notification" }) { notification ->
                    NotificationRow(
                        notification = notification,
                        onClick = {
                            when {
                                notification.postId != null && notification.type != "follow" && notification.type != "follow_accepted" ->
                                    onOpenPost(notification.postId)
                                notification.actor != null -> onOpenProfile(notification.actor.username)
                            }
                        },
                    )
                }
                if (state.nextCursor != null) {
                    item(key = "load-more", contentType = "load-more") {
                        Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                            if (state.isLoadingMore) {
                                Spinner(size = SpinnerSize.Sm, label = stringResource(Res.string.notifications_loading_more))
                            } else {
                                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    state.loadMoreError?.let {
                                        Text(text = stringResource(notificationErrorText(it)), variant = TextVariant.Small, color = OmicronTheme.colors.destructive)
                                    }
                                    Button(
                                        text = stringResource(Res.string.notifications_load_more),
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
private fun NotificationsHeader(modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth().padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = stringResource(Res.string.notifications_title), variant = TextVariant.H2, color = OmicronTheme.colors.foreground)
        Text(text = stringResource(Res.string.notifications_subtitle), variant = TextVariant.P, color = OmicronTheme.colors.mutedForeground)
    }
}

@Composable
private fun NotificationRow(
    notification: MobileNotification,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(OmicronTheme.radii.card)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(if (notification.read) OmicronTheme.colors.background else OmicronTheme.colors.muted.copy(alpha = 0.45f))
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 12.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(modifier = Modifier.size(40.dp), contentAlignment = Alignment.Center) {
            val actor = notification.actor
            if (actor == null) {
                Box(
                    modifier = Modifier.size(40.dp).clip(CircleShape).background(RikkaTheme.colors.muted),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(imageVector = notificationIcon(notification.type), contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Default)
                }
            } else {
                Box(
                    modifier = Modifier.size(40.dp).clip(CircleShape).background(RikkaTheme.colors.muted),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = actor.displayName.trim().firstOrNull()?.uppercase() ?: "?",
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.mutedForeground,
                    )
                    actor.avatarUrl?.let { url ->
                        AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(40.dp).clip(CircleShape))
                    }
                }
                Box(
                    modifier = Modifier.align(Alignment.BottomEnd).size(20.dp).clip(CircleShape).background(OmicronTheme.colors.background),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(imageVector = notificationIcon(notification.type), contentDescription = null, tint = OmicronTheme.colors.foregroundAlt, size = IconSize.Xs)
                }
            }
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = notificationSubject(notification),
                    variant = TextVariant.P,
                    color = OmicronTheme.colors.foreground,
                    style = androidx.compose.ui.text.TextStyle(fontWeight = FontWeight.SemiBold),
                    maxLines = 1,
                )
                Text(text = stringResource(notificationAction(notification.type)), variant = TextVariant.P, color = OmicronTheme.colors.foreground, maxLines = 2)
            }
            val context = notification.postTitle ?: notification.commentSnippet
            context?.let { Text(text = it, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 2) }
            Text(text = displayDate(notification.createdAt), variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
        }
    }
}

@Composable
private fun notificationErrorText(error: MobileFeatureError) =
    when (error) {
        MobileFeatureError.Offline -> Res.string.notifications_error_offline
        MobileFeatureError.Server -> Res.string.notifications_error_server
        MobileFeatureError.MissingInstance -> Res.string.notifications_error_missing_instance
    }

@Composable
private fun NotificationError(
    error: MobileFeatureError,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Text(text = stringResource(notificationErrorText(error)), variant = TextVariant.P, color = OmicronTheme.colors.foregroundAlt)
        Button(text = stringResource(Res.string.notifications_retry), onClick = onRetry, variant = ButtonVariant.Outline)
    }
}
