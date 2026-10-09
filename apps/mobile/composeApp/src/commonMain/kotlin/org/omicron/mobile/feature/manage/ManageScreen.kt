package org.omicron.mobile.feature.manage

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import kotlinx.datetime.TimeZone
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.ScheduleDialog
import org.omicron.mobile.core.designsystem.SessionExpiredNotice
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
import org.omicron.mobile.core.time.formatScheduledFor
import org.omicron.mobile.domain.model.OwnPost
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.manage_back
import org.omicron.mobile.resources.manage_cancel
import org.omicron.mobile.resources.manage_confirm_delete_description
import org.omicron.mobile.resources.manage_confirm_delete_draft
import org.omicron.mobile.resources.manage_confirm_delete_published
import org.omicron.mobile.resources.manage_confirm_delete_scheduled
import org.omicron.mobile.resources.manage_confirm_unpublish
import org.omicron.mobile.resources.manage_confirm_unpublish_description
import org.omicron.mobile.resources.manage_continue
import org.omicron.mobile.resources.manage_delete
import org.omicron.mobile.resources.manage_drafts
import org.omicron.mobile.resources.manage_edit
import org.omicron.mobile.resources.manage_empty_drafts
import org.omicron.mobile.resources.manage_empty_published
import org.omicron.mobile.resources.manage_empty_scheduled
import org.omicron.mobile.resources.manage_error_missing_instance
import org.omicron.mobile.resources.manage_error_offline
import org.omicron.mobile.resources.manage_error_server
import org.omicron.mobile.resources.manage_error_unauthorized
import org.omicron.mobile.resources.manage_last_edited
import org.omicron.mobile.resources.manage_load_error_title
import org.omicron.mobile.resources.manage_load_more
import org.omicron.mobile.resources.manage_loading
import org.omicron.mobile.resources.manage_loading_more
import org.omicron.mobile.resources.manage_publish_now
import org.omicron.mobile.resources.manage_published
import org.omicron.mobile.resources.manage_published_at
import org.omicron.mobile.resources.manage_publishes_at
import org.omicron.mobile.resources.manage_reschedule
import org.omicron.mobile.resources.manage_retry
import org.omicron.mobile.resources.manage_schedule
import org.omicron.mobile.resources.manage_scheduled
import org.omicron.mobile.resources.manage_subtitle
import org.omicron.mobile.resources.manage_tab_count
import org.omicron.mobile.resources.manage_title
import org.omicron.mobile.resources.manage_untitled_post
import org.omicron.mobile.resources.manage_unpublish
import org.omicron.mobile.resources.manage_unschedule
import org.omicron.mobile.resources.manage_view
import org.omicron.mobile.resources.timeline_session_expired
import org.omicron.mobile.resources.timeline_sign_in

@Composable
fun ManageRoute(
    viewModel: ManageViewModel,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onEdit: (String) -> Unit,
    onView: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    ManageScreen(
        state = state,
        onBack = onBack,
        onSignIn = onSignIn,
        onSelectTab = viewModel::selectTab,
        onRefresh = viewModel::refresh,
        onLoadMore = viewModel::loadMore,
        onRetryLoadMore = viewModel::retryLoadMore,
        onEdit = onEdit,
        onView = onView,
        onSchedule = viewModel::openReschedule,
        onReschedule = { id, at -> viewModel.reschedule(id, at) },
        onDismissSchedule = viewModel::dismissReschedule,
        onPublishNow = viewModel::publishNow,
        onUnschedule = viewModel::unschedule,
        onRequestUnpublish = { id -> viewModel.requestAction(ManagePendingAction.Unpublish(id)) },
        onRequestDelete = { post -> viewModel.requestAction(ManagePendingAction.Delete(post.id, state.tab)) },
        onCancelAction = viewModel::cancelPendingAction,
        onConfirmAction = viewModel::confirmPendingAction,
    )
}

@Composable
private fun ManageScreen(
    state: ManageUiState,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onSelectTab: (OwnPostStatus) -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onRetryLoadMore: () -> Unit,
    onEdit: (String) -> Unit,
    onView: (String) -> Unit,
    onSchedule: (OwnPost) -> Unit,
    onReschedule: (String, String) -> Unit,
    onDismissSchedule: () -> Unit,
    onPublishNow: (String) -> Unit,
    onUnschedule: (String) -> Unit,
    onRequestUnpublish: (String) -> Unit,
    onRequestDelete: (OwnPost) -> Unit,
    onCancelAction: () -> Unit,
    onConfirmAction: () -> Unit,
) {
    val zone = TimeZone.currentSystemDefault()
    Box(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    icon = RikkaIcons.ArrowLeft,
                    contentDescription = stringResource(Res.string.manage_back),
                    onClick = onBack,
                    size = IconButtonSize.Default,
                )
                Column(modifier = Modifier.padding(start = 4.dp)) {
                    Text(text = stringResource(Res.string.manage_title), variant = TextVariant.H2, color = OmicronTheme.colors.foreground)
                    Text(text = stringResource(Res.string.manage_subtitle), variant = TextVariant.Muted, color = OmicronTheme.colors.foreground)
                }
            }
            if (state.sessionExpired) {
                SessionExpiredNotice(
                    message = stringResource(Res.string.timeline_session_expired),
                    onSignIn = onSignIn,
                )
            }
            when (val phase = state.phase) {
                ManagePhase.Loading ->
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.manage_loading))
                    }
                is ManagePhase.Error ->
                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        ManageLoadError(phase.error, onRefresh, onSignIn)
                    }
                ManagePhase.Content -> {
                    val lane = state.lanes.getValue(state.tab)
                    if (lane.loaded) state.error?.let { error ->
                        ManageInlineError(error, onSignIn)
                    }
                    ManageTabs(state, onSelectTab)
                    when {
                        lane.loading && !lane.loaded ->
                            Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                                Spinner(size = SpinnerSize.Default, label = stringResource(Res.string.manage_loading))
                            }
                        !lane.loaded ->
                            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                                ManageLoadError(state.error ?: ManageError.Server, onRefresh, onSignIn)
                            }
                        lane.items.isEmpty() ->
                            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                                ManageEmpty(state.tab)
                            }
                        else -> {
                            LazyColumn(
                                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                items(lane.items, key = OwnPost::id, contentType = { "own-post" }) { post ->
                                    ManagePostCard(
                                        post = post,
                                        tab = state.tab,
                                        zone = zone,
                                        busy = state.actionBusyId == post.id,
                                        actionsEnabled = !state.actionBusy,
                                        onEdit = { onEdit(post.id) },
                                        onView = { onView(post.id) },
                                        onSchedule = { onSchedule(post) },
                                        onPublishNow = { onPublishNow(post.id) },
                                        onUnschedule = { onUnschedule(post.id) },
                                        onUnpublish = { onRequestUnpublish(post.id) },
                                        onDelete = { onRequestDelete(post) },
                                    )
                                }
                                if (state.loadMoreError != null) {
                                    item(key = "load-more-error") {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            Text(
                                                text = manageErrorText(state.loadMoreError),
                                                variant = TextVariant.Small,
                                                color = OmicronTheme.colors.destructive,
                                            )
                                            Button(
                                                text = stringResource(Res.string.manage_retry),
                                                onClick = onRetryLoadMore,
                                                variant = ButtonVariant.Outline,
                                            )
                                        }
                                    }
                                }
                                if (lane.cursor != null) {
                                    item(key = "load-more") {
                                        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.Center) {
                                            Button(
                                                text = stringResource(if (state.loadingMore) Res.string.manage_loading_more else Res.string.manage_load_more),
                                                onClick = onLoadMore,
                                                enabled = !state.loadingMore && !state.actionBusy,
                                                loading = state.loadingMore,
                                                variant = ButtonVariant.Outline,
                                            )
                                        }
                                    }
                                }
                                item(key = "bottom-space") { Spacer(Modifier.height(12.dp)) }
                            }
                        }
                    }
                }
            }
        }
        state.rescheduling?.let { post ->
            ScheduleDialog(
                current = post.publishAt,
                onDismiss = onDismissSchedule,
                onConfirm = { at -> onReschedule(post.id, at) },
                onUnschedule = { onDismissSchedule(); onUnschedule(post.id) },
            )
        }
        state.pendingAction?.let { pending ->
            ManageConfirmDialog(
                pending = pending,
                onCancel = onCancelAction,
                onConfirm = onConfirmAction,
            )
        }
    }
}

@Composable
private fun ManageTabs(state: ManageUiState, onSelectTab: (OwnPostStatus) -> Unit) {
    val tabs =
        listOf(
            OwnPostStatus.Draft to Res.string.manage_drafts,
            OwnPostStatus.Scheduled to Res.string.manage_scheduled,
            OwnPostStatus.Published to Res.string.manage_published,
        )
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        tabs.forEach { (tab, label) ->
            val count =
                when (tab) {
                    OwnPostStatus.Draft -> state.counts.draft
                    OwnPostStatus.Scheduled -> state.counts.scheduled
                    OwnPostStatus.Published -> state.counts.published
                }
            Button(
                text = stringResource(Res.string.manage_tab_count, stringResource(label), count),
                onClick = { onSelectTab(tab) },
                size = ButtonSize.Sm,
                variant = if (tab == state.tab) ButtonVariant.Secondary else ButtonVariant.Ghost,
            )
        }
    }
}

@Composable
private fun ManageEmpty(tab: OwnPostStatus) {
    val description =
        when (tab) {
            OwnPostStatus.Draft -> Res.string.manage_empty_drafts
            OwnPostStatus.Scheduled -> Res.string.manage_empty_scheduled
            OwnPostStatus.Published -> Res.string.manage_empty_published
        }
    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(text = stringResource(description), variant = TextVariant.Muted, color = OmicronTheme.colors.foreground)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ManagePostCard(
    post: OwnPost,
    tab: OwnPostStatus,
    zone: TimeZone,
    busy: Boolean,
    actionsEnabled: Boolean,
    onEdit: () -> Unit,
    onView: () -> Unit,
    onSchedule: () -> Unit,
    onPublishNow: () -> Unit,
    onUnschedule: () -> Unit,
    onUnpublish: () -> Unit,
    onDelete: () -> Unit,
) {
    val timestamp =
        when (tab) {
            OwnPostStatus.Draft -> post.updatedAt ?: post.createdAt
            OwnPostStatus.Scheduled -> post.publishAt
            OwnPostStatus.Published -> post.createdAt
        }?.let { formatScheduledFor(it, zone) }.orEmpty()
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .background(OmicronTheme.colors.backgroundAlt, RoundedCornerShape(OmicronTheme.radii.card))
                .border(1.dp, OmicronTheme.colors.borderCard, RoundedCornerShape(OmicronTheme.radii.card))
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = post.title?.trim()?.takeIf(String::isNotEmpty) ?: stringResource(Res.string.manage_untitled_post),
            variant = TextVariant.H3,
            color = OmicronTheme.colors.foreground,
        )
        post.summary?.takeIf(String::isNotBlank)?.let {
            Text(text = it, variant = TextVariant.P, color = OmicronTheme.colors.foregroundAlt)
        }
        val dateLabel =
            when (tab) {
                OwnPostStatus.Draft -> Res.string.manage_last_edited
                OwnPostStatus.Scheduled -> Res.string.manage_publishes_at
                OwnPostStatus.Published -> Res.string.manage_published_at
            }
        Text(
            text = stringResource(dateLabel, timestamp),
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Button(
                text = stringResource(if (tab == OwnPostStatus.Published) Res.string.manage_edit else Res.string.manage_continue),
                onClick = onEdit,
                enabled = actionsEnabled,
                variant = ButtonVariant.Outline,
                size = ButtonSize.Sm,
            )
            when (tab) {
                OwnPostStatus.Draft -> {
                    Button(text = stringResource(Res.string.manage_schedule), onClick = onSchedule, enabled = actionsEnabled, size = ButtonSize.Sm, variant = ButtonVariant.Outline)
                }
                OwnPostStatus.Scheduled -> {
                    Button(text = stringResource(Res.string.manage_reschedule), onClick = onSchedule, enabled = actionsEnabled, size = ButtonSize.Sm, variant = ButtonVariant.Outline)
                    Button(text = stringResource(Res.string.manage_publish_now), onClick = onPublishNow, enabled = actionsEnabled, loading = busy, size = ButtonSize.Sm)
                    Button(text = stringResource(Res.string.manage_unschedule), onClick = onUnschedule, enabled = actionsEnabled, size = ButtonSize.Sm, variant = ButtonVariant.Ghost)
                }
                OwnPostStatus.Published -> {
                    Button(text = stringResource(Res.string.manage_view), onClick = onView, enabled = actionsEnabled, size = ButtonSize.Sm, variant = ButtonVariant.Outline)
                    Button(text = stringResource(Res.string.manage_unpublish), onClick = onUnpublish, enabled = actionsEnabled, size = ButtonSize.Sm, variant = ButtonVariant.Ghost)
                }
            }
            Button(
                text = stringResource(Res.string.manage_delete),
                onClick = onDelete,
                enabled = actionsEnabled,
                variant = ButtonVariant.Destructive,
                size = ButtonSize.Sm,
            )
        }
    }
}

@Composable
private fun ManageLoadError(error: ManageError, onRetry: () -> Unit, onSignIn: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = stringResource(Res.string.manage_load_error_title), variant = TextVariant.H3, color = OmicronTheme.colors.foreground)
        Text(text = manageErrorText(error), variant = TextVariant.Muted, color = OmicronTheme.colors.foreground)
        Button(
            text = stringResource(if (error == ManageError.Unauthorized) Res.string.timeline_sign_in else Res.string.manage_retry),
            onClick = if (error == ManageError.Unauthorized) onSignIn else onRetry,
            variant = ButtonVariant.Outline,
        )
    }
}

@Composable
private fun ManageInlineError(error: ManageError, onSignIn: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = manageErrorText(error), variant = TextVariant.Small, color = OmicronTheme.colors.destructive, modifier = Modifier.weight(1f))
        if (error == ManageError.Unauthorized) {
            Button(text = stringResource(Res.string.timeline_sign_in), onClick = onSignIn, size = ButtonSize.Sm, variant = ButtonVariant.Outline)
        }
    }
}

@Composable
private fun manageErrorText(error: ManageError): String =
    stringResource(
        when (error) {
            ManageError.Offline -> Res.string.manage_error_offline
            ManageError.Server -> Res.string.manage_error_server
            ManageError.MissingInstance -> Res.string.manage_error_missing_instance
            ManageError.Unauthorized -> Res.string.manage_error_unauthorized
        },
    )

@Composable
private fun ManageConfirmDialog(
    pending: ManagePendingAction,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
) {
    val title =
        when (pending) {
            is ManagePendingAction.Delete ->
                when (pending.status) {
                    OwnPostStatus.Draft -> Res.string.manage_confirm_delete_draft
                    OwnPostStatus.Scheduled -> Res.string.manage_confirm_delete_scheduled
                    OwnPostStatus.Published -> Res.string.manage_confirm_delete_published
                }
            is ManagePendingAction.Unpublish -> Res.string.manage_confirm_unpublish
        }
    val description =
        when (pending) {
            is ManagePendingAction.Delete -> Res.string.manage_confirm_delete_description
            is ManagePendingAction.Unpublish -> Res.string.manage_confirm_unpublish_description
        }
    val destructiveLabel =
        when (pending) {
            is ManagePendingAction.Delete -> Res.string.manage_delete
            is ManagePendingAction.Unpublish -> Res.string.manage_unpublish
        }
    Box(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.dark40).clickable(role = Role.Button, onClick = {}),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier =
                Modifier.fillMaxWidth().padding(24.dp)
                    .background(OmicronTheme.colors.background, RoundedCornerShape(OmicronTheme.radii.card))
                    .border(1.dp, OmicronTheme.colors.borderCard, RoundedCornerShape(OmicronTheme.radii.card))
                    .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(text = stringResource(title), variant = TextVariant.H3, color = OmicronTheme.colors.foreground)
            Text(text = stringResource(description), variant = TextVariant.P, color = OmicronTheme.colors.foregroundAlt)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.weight(1f))
                Button(text = stringResource(Res.string.manage_cancel), onClick = onCancel, variant = ButtonVariant.Ghost)
                Button(text = stringResource(destructiveLabel), onClick = onConfirm, variant = ButtonVariant.Destructive)
            }
        }
    }
}
