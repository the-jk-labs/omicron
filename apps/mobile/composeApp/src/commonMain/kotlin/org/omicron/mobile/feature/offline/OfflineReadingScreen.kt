package org.omicron.mobile.feature.offline

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.datetime.TimeZone
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
import org.omicron.mobile.core.time.formatScheduledFor
import org.omicron.mobile.domain.model.OfflinePostSummary
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.offline_back
import org.omicron.mobile.resources.offline_clear_all
import org.omicron.mobile.resources.offline_description
import org.omicron.mobile.resources.offline_empty
import org.omicron.mobile.resources.offline_error_missing_instance
import org.omicron.mobile.resources.offline_error_storage
import org.omicron.mobile.resources.offline_loading
import org.omicron.mobile.resources.offline_read
import org.omicron.mobile.resources.offline_remove
import org.omicron.mobile.resources.offline_retry
import org.omicron.mobile.resources.offline_saved_at
import org.omicron.mobile.resources.offline_title
import org.omicron.mobile.resources.offline_untitled
import kotlin.time.Instant

@Composable
fun OfflineReadingRoute(
    viewModel: OfflineReadingViewModel,
    onBack: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    OfflineReadingScreen(
        state = state,
        onBack = onBack,
        onRetry = viewModel::refresh,
        onOpenPost = onOpenPost,
        onRemove = viewModel::remove,
        onClear = viewModel::clear,
    )
}

@Composable
private fun OfflineReadingScreen(
    state: OfflineReadingUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onOpenPost: (String) -> Unit,
    onRemove: (String) -> Unit,
    onClear: () -> Unit,
) {
    val zone = TimeZone.currentSystemDefault()
    Column(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                icon = RikkaIcons.ArrowLeft,
                contentDescription = stringResource(Res.string.offline_back),
                onClick = onBack,
                size = IconButtonSize.Default,
            )
            Text(text = stringResource(Res.string.offline_title), variant = TextVariant.H2, color = OmicronTheme.colors.foreground)
        }
        Text(
            text = stringResource(Res.string.offline_description),
            variant = TextVariant.Small,
            color = OmicronTheme.colors.foregroundAlt,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        when (val phase = state.phase) {
            OfflineReadingPhase.Loading ->
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Spinner(size = SpinnerSize.Default, label = stringResource(Res.string.offline_loading))
                }
            is OfflineReadingPhase.Error ->
                OfflineReadingError(phase.error, onRetry, Modifier.weight(1f).fillMaxWidth())
            OfflineReadingPhase.Content -> {
                state.error?.let { error ->
                    Text(
                        text = offlineErrorMessage(error),
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.destructive,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                }
                if (state.posts.isEmpty()) {
                    Box(modifier = Modifier.weight(1f).fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        Text(text = stringResource(Res.string.offline_empty), variant = TextVariant.Muted, color = OmicronTheme.colors.foreground)
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        Button(
                            text = stringResource(Res.string.offline_clear_all),
                            onClick = onClear,
                            enabled = !state.isMutating,
                            variant = ButtonVariant.Ghost,
                            size = ButtonSize.Sm,
                        )
                    }
                    LazyColumn(
                        modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(state.posts, key = OfflinePostSummary::id, contentType = { "offline-post" }) { post ->
                            OfflinePostCard(
                                post = post,
                                zone = zone,
                                enabled = !state.isMutating,
                                onOpen = { onOpenPost(post.id) },
                                onRemove = { onRemove(post.id) },
                            )
                        }
                        item(key = "bottom-space") { Spacer(Modifier.height(12.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun OfflinePostCard(
    post: OfflinePostSummary,
    zone: TimeZone,
    enabled: Boolean,
    onOpen: () -> Unit,
    onRemove: () -> Unit,
) {
    val savedAt =
        formatScheduledFor(Instant.fromEpochMilliseconds(post.cachedAtMillis).toString(), zone).orEmpty()
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .background(OmicronTheme.colors.backgroundAlt, RoundedCornerShape(OmicronTheme.radii.card))
                .border(1.dp, OmicronTheme.colors.borderCard, RoundedCornerShape(OmicronTheme.radii.card))
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = post.title?.trim()?.takeIf(String::isNotEmpty) ?: stringResource(Res.string.offline_untitled),
            variant = TextVariant.H3,
            color = OmicronTheme.colors.foreground,
        )
        Text(text = post.authorDisplayName, variant = TextVariant.Small, color = OmicronTheme.colors.foregroundAlt)
        Text(
            text = stringResource(Res.string.offline_saved_at, savedAt),
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(text = stringResource(Res.string.offline_read), onClick = onOpen, enabled = enabled, size = ButtonSize.Sm)
            Button(
                text = stringResource(Res.string.offline_remove),
                onClick = onRemove,
                enabled = enabled,
                size = ButtonSize.Sm,
                variant = ButtonVariant.Ghost,
            )
        }
    }
}

@Composable
private fun OfflineReadingError(error: OfflineReadingError, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = stringResource(if (error == OfflineReadingError.MissingInstance) Res.string.offline_error_missing_instance else Res.string.offline_error_storage),
            variant = TextVariant.P,
            color = OmicronTheme.colors.foreground,
        )
        Button(text = stringResource(Res.string.offline_retry), onClick = onRetry, variant = ButtonVariant.Outline)
    }
}

@Composable
private fun offlineErrorMessage(error: OfflineReadingError): String =
    stringResource(if (error == OfflineReadingError.MissingInstance) Res.string.offline_error_missing_instance else Res.string.offline_error_storage)
