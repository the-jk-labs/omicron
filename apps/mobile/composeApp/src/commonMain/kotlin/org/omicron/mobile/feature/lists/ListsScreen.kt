package org.omicron.mobile.feature.lists

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.input.Input
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.ReadingList
import org.omicron.mobile.feature.common.MobileFeatureError
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.lists_cancel
import org.omicron.mobile.resources.lists_create
import org.omicron.mobile.resources.lists_description
import org.omicron.mobile.resources.lists_empty
import org.omicron.mobile.resources.lists_error_missing_instance
import org.omicron.mobile.resources.lists_error_offline
import org.omicron.mobile.resources.lists_error_server
import org.omicron.mobile.resources.lists_item_count_many
import org.omicron.mobile.resources.lists_item_count_one
import org.omicron.mobile.resources.lists_loading
import org.omicron.mobile.resources.lists_name
import org.omicron.mobile.resources.lists_private
import org.omicron.mobile.resources.lists_public
import org.omicron.mobile.resources.lists_read_later
import org.omicron.mobile.resources.lists_retry
import org.omicron.mobile.resources.lists_save
import org.omicron.mobile.resources.lists_title
import org.omicron.mobile.resources.lists_visibility_private
import org.omicron.mobile.resources.lists_visibility_public
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun ListsRoute(
    viewModel: ListsViewModel,
    onOpenList: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    ListsScreen(
        state = state,
        onOpenList = onOpenList,
        onRetry = viewModel::retry,
        onCreateList = viewModel::createList,
    )
}

@Composable
private fun ListsScreen(
    state: ListsUiState,
    onOpenList: (String) -> Unit,
    onRetry: () -> Unit,
    onCreateList: (String, String, String) -> Unit,
) {
    var showCreateDialog by remember { mutableStateOf(false) }
    var initialListCount by remember { mutableIntStateOf(state.lists.size) }
    LaunchedEffect(state.lists.size, showCreateDialog) {
        if (showCreateDialog && state.lists.size > initialListCount) showCreateDialog = false
    }
    Column(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = stringResource(Res.string.lists_title), variant = TextVariant.H2, color = OmicronTheme.colors.foreground)
            Button(
                onClick = {
                    initialListCount = state.lists.size
                    showCreateDialog = true
                },
                label = stringResource(Res.string.lists_create),
                size = ButtonSize.Sm,
            ) {
                Icon(imageVector = RikkaIcons.Plus, contentDescription = null, size = IconSize.Sm)
                Text(text = stringResource(Res.string.lists_create), variant = TextVariant.Small)
            }
        }
        when (state.phase) {
            ListsPhase.Loading ->
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.lists_loading))
                }
            ListsPhase.Error ->
                ListsError(error = state.error ?: MobileFeatureError.Server, onRetry = onRetry)
            ListsPhase.Empty ->
                Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(Res.string.lists_empty), variant = TextVariant.P, color = OmicronTheme.colors.mutedForeground)
                }
            ListsPhase.Content ->
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 20.dp),
                ) {
                    items(state.lists, key = ReadingList::id, contentType = { "reading-list" }) { list ->
                        ReadingListCard(list = list, onClick = { onOpenList(list.id) })
                    }
                }
        }
    }
    if (showCreateDialog) {
        CreateListDialog(
            isSaving = state.isCreating,
            error = state.createError,
            onDismiss = { showCreateDialog = false },
            onSave = onCreateList,
        )
    }
}

@Composable
private fun ReadingListCard(
    list: ReadingList,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(OmicronTheme.radii.card)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(OmicronTheme.colors.backgroundAlt)
                .border(1.dp, OmicronTheme.colors.borderCard, shape)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(48.dp).clip(RoundedCornerShape(OmicronTheme.radii.cardSmall)).background(RikkaTheme.colors.muted),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (list.isReadLater) RikkaIcons.Bookmark else RikkaIcons.Library,
                contentDescription = null,
                tint = OmicronTheme.colors.foregroundAlt,
                size = IconSize.Lg,
            )
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = if (list.isReadLater) stringResource(Res.string.lists_read_later) else list.title,
                variant = TextVariant.H4,
                color = OmicronTheme.colors.foreground,
                maxLines = 1,
            )
            if (list.description.isNotBlank()) {
                Text(text = list.description, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 2)
            }
            val count =
                if (list.itemCount == 1) {
                    stringResource(Res.string.lists_item_count_one)
                } else {
                    stringResource(Res.string.lists_item_count_many, list.itemCount)
                }
            Text(
                text = "$count · ${stringResource(if (list.visibility == "private") Res.string.lists_private else Res.string.lists_public)}",
                variant = TextVariant.Small,
                color = OmicronTheme.colors.mutedForeground,
            )
        }
        Icon(imageVector = RikkaIcons.ChevronRight, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Default)
    }
}

@Composable
private fun CreateListDialog(
    isSaving: Boolean,
    error: MobileFeatureError?,
    onDismiss: () -> Unit,
    onSave: (String, String, String) -> Unit,
) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var visibility by remember { mutableStateOf("public") }
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(OmicronTheme.radii.card))
                    .background(OmicronTheme.colors.background)
                    .border(1.dp, OmicronTheme.colors.borderCard, RoundedCornerShape(OmicronTheme.radii.card))
                    .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(text = stringResource(Res.string.lists_create), variant = TextVariant.H3)
            Input(value = title, onValueChange = { title = it.take(100) }, placeholder = stringResource(Res.string.lists_name), label = stringResource(Res.string.lists_name))
            Input(
                value = description,
                onValueChange = { description = it.take(500) },
                placeholder = stringResource(Res.string.lists_description),
                label = stringResource(Res.string.lists_description),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    text = stringResource(Res.string.lists_visibility_public),
                    onClick = { visibility = "public" },
                    selected = visibility == "public",
                    variant = if (visibility == "public") ButtonVariant.Secondary else ButtonVariant.Outline,
                )
                Button(
                    text = stringResource(Res.string.lists_visibility_private),
                    onClick = { visibility = "private" },
                    selected = visibility == "private",
                    variant = if (visibility == "private") ButtonVariant.Secondary else ButtonVariant.Outline,
                )
            }
            error?.let {
                Text(text = stringResource(listErrorText(it)), variant = TextVariant.Small, color = OmicronTheme.colors.destructive)
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(text = stringResource(Res.string.lists_cancel), onClick = onDismiss, variant = ButtonVariant.Ghost)
                Spacer(Modifier.size(8.dp))
                Button(
                    text = stringResource(Res.string.lists_save),
                    onClick = { onSave(title.trim(), description.trim(), visibility) },
                    enabled = title.isNotBlank(),
                    loading = isSaving,
                )
            }
        }
    }
}

@Composable
private fun ListsError(
    error: MobileFeatureError,
    onRetry: () -> Unit,
) {
    val message = stringResource(listErrorText(error))
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Text(text = message, variant = TextVariant.P, color = OmicronTheme.colors.foregroundAlt)
        Button(text = stringResource(Res.string.lists_retry), onClick = onRetry, variant = ButtonVariant.Outline)
    }
}

private fun listErrorText(error: MobileFeatureError) =
    when (error) {
        MobileFeatureError.Offline -> Res.string.lists_error_offline
        MobileFeatureError.Server -> Res.string.lists_error_server
        MobileFeatureError.MissingInstance -> Res.string.lists_error_missing_instance
    }
