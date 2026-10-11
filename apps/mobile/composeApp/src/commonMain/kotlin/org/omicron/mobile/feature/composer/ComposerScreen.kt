package org.omicron.mobile.feature.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import kotlinx.datetime.TimeZone
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.CenteredLoadingState
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.ScheduleDialog
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButton
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.dropdown.DropdownMenu
import org.omicron.mobile.core.designsystem.rikkaui.dropdown.DropdownMenuItem
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.input.Input
import org.omicron.mobile.core.designsystem.rikkaui.separator.Separator
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.core.designsystem.rikkaui.textarea.Textarea
import org.omicron.mobile.core.picker.rememberImagePickerLauncher
import org.omicron.mobile.core.time.formatScheduledFor
import org.omicron.mobile.domain.model.ComposerBlock
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.composer_add_item
import org.omicron.mobile.resources.composer_back
import org.omicron.mobile.resources.composer_block_hint
import org.omicron.mobile.resources.composer_block_options
import org.omicron.mobile.resources.composer_code_hint
import org.omicron.mobile.resources.composer_cover_empty
import org.omicron.mobile.resources.composer_cover_label
import org.omicron.mobile.resources.composer_draft_badge
import org.omicron.mobile.resources.composer_empty_body
import org.omicron.mobile.resources.composer_error_missing_instance
import org.omicron.mobile.resources.composer_error_offline
import org.omicron.mobile.resources.composer_error_server
import org.omicron.mobile.resources.composer_error_too_large
import org.omicron.mobile.resources.composer_error_unauthorized
import org.omicron.mobile.resources.composer_error_unsupported_type
import org.omicron.mobile.resources.composer_heading_hint
import org.omicron.mobile.resources.composer_image_alt_hint
import org.omicron.mobile.resources.composer_image_block
import org.omicron.mobile.resources.composer_image_preview_failed
import org.omicron.mobile.resources.composer_list_item_hint
import org.omicron.mobile.resources.composer_load_error_title
import org.omicron.mobile.resources.composer_loading
import org.omicron.mobile.resources.composer_not_found_description
import org.omicron.mobile.resources.composer_not_found_title
import org.omicron.mobile.resources.composer_preserved
import org.omicron.mobile.resources.composer_preserved_block
import org.omicron.mobile.resources.composer_publish
import org.omicron.mobile.resources.composer_publish_now
import org.omicron.mobile.resources.composer_published_message
import org.omicron.mobile.resources.composer_published_badge
import org.omicron.mobile.resources.composer_publishing_options
import org.omicron.mobile.resources.composer_quote_hint
import org.omicron.mobile.resources.composer_remove_block
import org.omicron.mobile.resources.composer_remove_cover
import org.omicron.mobile.resources.composer_remove_item
import org.omicron.mobile.resources.composer_reschedule
import org.omicron.mobile.resources.composer_retry
import org.omicron.mobile.resources.composer_save_changes
import org.omicron.mobile.resources.composer_save_draft
import org.omicron.mobile.resources.composer_saved
import org.omicron.mobile.resources.composer_saving
import org.omicron.mobile.resources.composer_schedule
import org.omicron.mobile.resources.composer_scheduled_message
import org.omicron.mobile.resources.composer_set_cover
import org.omicron.mobile.resources.composer_sign_in
import org.omicron.mobile.resources.composer_title_edit
import org.omicron.mobile.resources.composer_title_hint
import org.omicron.mobile.resources.composer_title_new
import org.omicron.mobile.resources.composer_uploading
import org.omicron.mobile.resources.composer_unsaved
import org.omicron.mobile.resources.composer_validation_body
import org.omicron.mobile.resources.composer_validation_title
import org.omicron.mobile.resources.composer_view_post
import org.omicron.mobile.resources.schedule_error_past

@Composable
fun ComposerRoute(
    viewModel: ComposerViewModel,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onPublished: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    val launchPicker = rememberImagePickerLauncher { bytes, mime ->
        viewModel.pickImageResult(bytes, mime)
    }
    val launchCoverPicker = rememberImagePickerLauncher { bytes, mime ->
        viewModel.pickCoverResult(bytes, mime)
    }
    ComposerScreen(
        state = state,
        onBack = onBack,
        onSignIn = onSignIn,
        onPublished = onPublished,
        onTitleChange = viewModel::updateTitle,
        onSummaryChange = viewModel::updateSummary,
        onTagsChange = viewModel::updateTags,
        onLanguageChange = viewModel::updateLanguage,
        onBlockTextChange = viewModel::updateBlockText,
        onListItemChange = viewModel::updateListItem,
        onAddListItem = viewModel::addListItem,
        onRemoveListItem = viewModel::removeListItem,
        onAddBlock = viewModel::addBlock,
        onRemoveBlock = viewModel::removeBlock,
        onPickImage = launchPicker,
        onPickCover = launchCoverPicker,
        onRemoveCover = viewModel::removeCover,
        onImageAltChange = viewModel::updateImageAlt,
        onRetryImageUpload = viewModel::retryImageUpload,
        onRetryCoverUpload = viewModel::retryCoverUpload,
        onSaveDraft = viewModel::saveDraft,
        onPublish = viewModel::publish,
        onOpenSchedule = viewModel::openSchedule,
        onDismissSchedule = viewModel::dismissSchedule,
        onSchedulePost = viewModel::schedulePost,
        onUnschedule = viewModel::unschedule,
        onRetryLoad = viewModel::retryLoad,
        onRetrySave = viewModel::retrySave,
    )
}

@Composable
internal fun ComposerScreen(
    state: ComposerUiState,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onPublished: (String) -> Unit,
    onTitleChange: (String) -> Unit,
    onSummaryChange: (String) -> Unit,
    onTagsChange: (String) -> Unit,
    onLanguageChange: (String) -> Unit,
    onBlockTextChange: (String, String) -> Unit,
    onListItemChange: (String, Int, String) -> Unit,
    onAddListItem: (String) -> Unit,
    onRemoveListItem: (String, Int) -> Unit,
    onAddBlock: (ComposerBlockType) -> Unit,
    onRemoveBlock: (String) -> Unit,
    onPickImage: () -> Unit,
    onPickCover: () -> Unit,
    onRemoveCover: () -> Unit,
    onImageAltChange: (String, String) -> Unit,
    onRetryImageUpload: () -> Unit,
    onRetryCoverUpload: () -> Unit,
    onSaveDraft: () -> Unit,
    onPublish: () -> Unit,
    onOpenSchedule: () -> Unit,
    onDismissSchedule: () -> Unit,
    onSchedulePost: (String) -> Unit,
    onUnschedule: () -> Unit,
    onRetryLoad: () -> Unit,
    onRetrySave: () -> Unit,
) {
    Box(
        modifier =
            Modifier.fillMaxSize()
                .background(OmicronTheme.colors.background)
                .safeDrawingPadding()
                .imePadding(),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    icon = RikkaIcons.ChevronLeft,
                    contentDescription = stringResource(Res.string.composer_back),
                    onClick = onBack,
                    size = IconButtonSize.Default,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text =
                        stringResource(
                            if (state.postId == null) Res.string.composer_title_new
                            else Res.string.composer_title_edit,
                        ),
                    variant = TextVariant.H3,
                    color = OmicronTheme.colors.foreground,
                    modifier = Modifier.weight(1f),
                    style = TextStyle(fontSize = 18.sp, lineHeight = 24.sp),
                )
            }
            if (state.loadPhase == ComposerLoadPhase.Content) {
                ComposerActions(state, onSaveDraft, onPublish, onOpenSchedule)
                Column(
                    modifier =
                        Modifier.fillMaxWidth()
                            .semantics { liveRegion = LiveRegionMode.Polite }
                            .padding(horizontal = 16.dp),
                ) {
                    ComposerStatus(state, onSignIn, onPublished, onRetrySave)
                }
                Separator(modifier = Modifier.padding(top = 8.dp))
            }
            when (val phase = state.loadPhase) {
                is ComposerLoadPhase.Loading -> ComposerLoading()
                is ComposerLoadPhase.Error ->
                    ComposerLoadError(
                        error = phase.error,
                        onRetry = onRetryLoad,
                        onSignIn = onSignIn,
                    )
                is ComposerLoadPhase.Content ->
                    ComposerEditor(
                        state = state,
                        onTitleChange = onTitleChange,
                        onSummaryChange = onSummaryChange,
                        onTagsChange = onTagsChange,
                        onLanguageChange = onLanguageChange,
                        onBlockTextChange = onBlockTextChange,
                        onListItemChange = onListItemChange,
                        onAddListItem = onAddListItem,
                        onRemoveListItem = onRemoveListItem,
                        onAddBlock = onAddBlock,
                        onRemoveBlock = onRemoveBlock,
                        onPickImage = onPickImage,
                        onPickCover = onPickCover,
                        onRemoveCover = onRemoveCover,
                        onImageAltChange = onImageAltChange,
                        onRetryImageUpload = onRetryImageUpload,
                        onRetryCoverUpload = onRetryCoverUpload,
                        modifier = Modifier.weight(1f),
                    )
            }
        }
        if (state.scheduleOpen) {
            ScheduleDialog(
                current = state.scheduledFor,
                onDismiss = onDismissSchedule,
                onConfirm = onSchedulePost,
                onUnschedule = onUnschedule,
            )
        }
    }
}

@Composable
private fun ComposerLoading() {
    CenteredLoadingState(message = stringResource(Res.string.composer_loading), size = SpinnerSize.Default)
}

@Composable
private fun ComposerLoadError(error: ComposerError, onRetry: () -> Unit, onSignIn: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text =
                    if (error == ComposerError.NotFound) {
                        stringResource(Res.string.composer_not_found_title)
                    } else {
                        stringResource(Res.string.composer_load_error_title)
                    },
                variant = TextVariant.H3,
                color = OmicronTheme.colors.foreground,
            )
            Text(
                text =
                    when (error) {
                        ComposerError.Offline -> stringResource(Res.string.composer_error_offline)
                        ComposerError.MissingInstance -> stringResource(Res.string.composer_error_missing_instance)
                        ComposerError.Unauthorized -> stringResource(Res.string.composer_error_unauthorized)
                        ComposerError.NotFound -> stringResource(Res.string.composer_not_found_description)
                        ComposerError.Server -> stringResource(Res.string.composer_error_server)
                        ComposerError.TooLarge -> stringResource(Res.string.composer_error_too_large)
                        ComposerError.UnsupportedType -> stringResource(Res.string.composer_error_unsupported_type)
                    },
                variant = TextVariant.Muted,
                color = OmicronTheme.colors.foreground,
            )
            if (error == ComposerError.Unauthorized) {
                Button(text = stringResource(Res.string.composer_sign_in), onClick = onSignIn)
            } else {
                Button(text = stringResource(Res.string.composer_retry), onClick = onRetry)
            }
        }
    }
}

@Composable
private fun ComposerEditor(
    state: ComposerUiState,
    onTitleChange: (String) -> Unit,
    onSummaryChange: (String) -> Unit,
    onTagsChange: (String) -> Unit,
    onLanguageChange: (String) -> Unit,
    onBlockTextChange: (String, String) -> Unit,
    onListItemChange: (String, Int, String) -> Unit,
    onAddListItem: (String) -> Unit,
    onRemoveListItem: (String, Int) -> Unit,
    onAddBlock: (ComposerBlockType) -> Unit,
    onRemoveBlock: (String) -> Unit,
    onPickImage: () -> Unit,
    onPickCover: () -> Unit,
    onRemoveCover: () -> Unit,
    onImageAltChange: (String, String) -> Unit,
    onRetryImageUpload: () -> Unit,
    onRetryCoverUpload: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    var detailsOpen by rememberSaveable { mutableStateOf(false) }
    var knownBlocks by remember { mutableStateOf(state.blocks.map { it.id }.toSet()) }
    var focusedBlock by remember { mutableStateOf<String?>(null) }
    val blockIds = state.blocks.map { it.id }
    LaunchedEffect(blockIds) {
        val added = state.blocks.lastOrNull { it.id !in knownBlocks }
        knownBlocks = blockIds.toSet()
        if (added != null) {
            listState.scrollToItem(2 + state.blocks.indexOf(added))
            focusedBlock = added.id
        }
    }
    Column(modifier) {
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item(key = "title", contentType = "title") {
                Input(
                    value = state.title,
                    onValueChange = onTitleChange,
                    placeholder = stringResource(Res.string.composer_title_hint),
                    label = stringResource(Res.string.composer_title_hint),
                    singleLine = false,
                    modifier = Modifier.heightIn(min = 56.dp),
                    style =
                        TextStyle(
                            fontSize = 26.sp,
                            lineHeight = 34.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                )
            }
            item(key = "details", contentType = "details") {
                ComposerDetails(
                    state = state,
                    open = detailsOpen,
                    onOpenChange = { detailsOpen = it },
                    onSummaryChange = onSummaryChange,
                    onTagsChange = onTagsChange,
                    onLanguageChange = onLanguageChange,
                    cover = {
                        ComposerCoverSection(
                            previewUrl =
                                state.coverUrl?.ifEmpty { null }
                                    ?: state.sourceCoverUrl
                                    ?: state.blocks.firstImageUrl(),
                            hasCover =
                                (state.coverUrl?.ifEmpty { null } ?: state.sourceCoverUrl) != null,
                            upload = state.coverUpload,
                            onPick = onPickCover,
                            onRemove = onRemoveCover,
                            onRetry = onRetryCoverUpload,
                        )
                    },
                )
            }
            items(state.blocks, key = { it.id }, contentType = { it::class }) { block ->
                ComposerBlockEditor(
                    block = block,
                    requestFocus = focusedBlock == block.id,
                    onFocusHandled = { focusedBlock = null },
                    onBlockTextChange = onBlockTextChange,
                    onListItemChange = onListItemChange,
                    onAddListItem = onAddListItem,
                    onRemoveListItem = onRemoveListItem,
                    onRemoveBlock = onRemoveBlock,
                    onImageAltChange = onImageAltChange,
                )
            }
            if (state.blocks.isEmpty()) {
                item(key = "empty", contentType = "empty") {
                    Text(
                        text = stringResource(Res.string.composer_empty_body),
                        variant = TextVariant.Muted,
                        color = OmicronTheme.colors.mutedForeground,
                    )
                }
            }
        }
        Column(
            modifier =
                Modifier.fillMaxWidth()
                    .semantics { liveRegion = LiveRegionMode.Polite }
                    .padding(horizontal = 16.dp),
        ) {
            ComposerUploadStatus(state.imageUpload, onRetryImageUpload)
        }
        ComposerToolbar(
            onAddBlock,
            onPickImage,
            enabled =
                state.imageUpload != ImageUploadState.Uploading &&
                    state.coverUpload != ImageUploadState.Uploading,
        )
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun ComposerActions(
    state: ComposerUiState,
    onSaveDraft: () -> Unit,
    onPublish: () -> Unit,
    onOpenSchedule: () -> Unit,
) {
    val busy =
        state.save == ComposerSave.Saving ||
            state.publish == ComposerPublish.Publishing ||
            state.imageUpload == ImageUploadState.Uploading ||
            state.coverUpload == ImageUploadState.Uploading
    FlowRow(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Button(
            text =
                stringResource(
                    if (state.sourceStatus == OwnPostStatus.Published)
                        Res.string.composer_save_changes
                    else Res.string.composer_save_draft,
                ),
            onClick = onSaveDraft,
            variant = ButtonVariant.Ghost,
            size = ButtonSize.Sm,
            loading = state.save == ComposerSave.Saving,
            enabled = !busy,
            modifier = Modifier.heightIn(min = 48.dp),
            leadingIcon = { Icon(RikkaIcons.FileText, null, size = IconSize.Sm) },
        )
        if (state.sourceStatus != OwnPostStatus.Published) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(
                    text =
                        stringResource(
                            if (state.scheduledFor != null) Res.string.composer_publish_now
                            else Res.string.composer_publish,
                        ),
                    onClick = onPublish,
                    size = ButtonSize.Sm,
                    loading = state.publish == ComposerPublish.Publishing,
                    enabled = !busy,
                    modifier = Modifier.heightIn(min = 48.dp),
                    leadingIcon = { Icon(RikkaIcons.Send, null, size = IconSize.Sm) },
                )
                var expanded by remember { mutableStateOf(false) }
                val label = stringResource(Res.string.composer_publishing_options)
                DropdownMenu(
                    expanded = expanded,
                    onDismiss = { expanded = false },
                    label = label,
                    trigger = {
                        IconButton(
                            icon = RikkaIcons.ChevronDown,
                            contentDescription = label,
                            onClick = { expanded = true },
                            enabled = !busy,
                            modifier = Modifier.size(48.dp),
                        )
                    },
                ) {
                    DropdownMenuItem(
                        text =
                            stringResource(
                                if (state.scheduledFor != null) Res.string.composer_reschedule
                                else Res.string.composer_schedule,
                            ),
                        icon = RikkaIcons.Calendar,
                        enabled = !busy,
                        onClick = {
                            expanded = false
                            onOpenSchedule()
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ComposerStatus(
    state: ComposerUiState,
    onSignIn: () -> Unit,
    onPublished: (String) -> Unit,
    onRetrySave: () -> Unit,
) {
    val save = state.save
    val publish = state.publish
    val zone = remember { TimeZone.currentSystemDefault() }
    when {
        publish is ComposerPublish.Scheduled -> {
            Text(
                text =
                    stringResource(
                        Res.string.composer_scheduled_message,
                        state.scheduledFor?.let { formatScheduledFor(it, zone) } ?: state.scheduledFor.orEmpty(),
                    ),
                variant = TextVariant.Small,
                color = OmicronTheme.colors.foreground,
            )
        }
        publish is ComposerPublish.Published && state.postId != null -> {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = stringResource(Res.string.composer_published_message),
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.foreground,
                )
                Button(
                    text = stringResource(Res.string.composer_view_post),
                    onClick = { onPublished(state.postId) },
                    variant = ButtonVariant.Secondary,
                    size = ButtonSize.Sm,
                )
            }
        }
        publish is ComposerPublish.Validation -> {
            Text(
                text =
                    stringResource(
                        when (publish.issue) {
                            PublishIssue.MissingTitle -> Res.string.composer_validation_title
                            PublishIssue.EmptyBody -> Res.string.composer_validation_body
                            PublishIssue.PastSchedule -> Res.string.schedule_error_past
                        },
                    ),
                variant = TextVariant.Small,
                color = OmicronTheme.colors.foreground,
            )
        }
        publish is ComposerPublish.Error -> {
            ComposerErrorRow(error = publish.error, onRetry = onRetrySave, onSignIn = onSignIn)
        }
        save is ComposerSave.Saving -> {
            Text(
                text = stringResource(Res.string.composer_saving),
                variant = TextVariant.Small,
                color = OmicronTheme.colors.foreground,
            )
        }
        save is ComposerSave.Saved -> {
            Text(
                text = stringResource(if (state.dirty) Res.string.composer_unsaved else Res.string.composer_saved),
                variant = TextVariant.Small,
                color = OmicronTheme.colors.foreground,
            )
        }
        save is ComposerSave.Validation -> {
            Text(
                text = stringResource(Res.string.composer_validation_body),
                variant = TextVariant.Small,
                color = OmicronTheme.colors.foreground,
            )
        }
        save is ComposerSave.Error -> {
            ComposerErrorRow(error = save.error, onRetry = onRetrySave, onSignIn = onSignIn)
        }
        state.scheduledFor != null -> {
            Text(
                text =
                    stringResource(
                        Res.string.composer_scheduled_message,
                        formatScheduledFor(state.scheduledFor, zone) ?: state.scheduledFor,
                    ),
                variant = TextVariant.Small,
                color = OmicronTheme.colors.mutedForeground,
            )
        }
        else -> {
            Text(
                text = stringResource(if (state.sourceStatus == OwnPostStatus.Published) Res.string.composer_published_badge else Res.string.composer_draft_badge),
                variant = TextVariant.Small,
                color = OmicronTheme.colors.mutedForeground,
            )
        }
    }
}

@Composable
private fun ComposerErrorRow(error: ComposerError, onRetry: () -> Unit, onSignIn: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text =
                when (error) {
                    ComposerError.Offline -> stringResource(Res.string.composer_error_offline)
                    ComposerError.MissingInstance -> stringResource(Res.string.composer_error_missing_instance)
                    ComposerError.Unauthorized -> stringResource(Res.string.composer_error_unauthorized)
                    ComposerError.NotFound -> stringResource(Res.string.composer_not_found_description)
                    ComposerError.Server -> stringResource(Res.string.composer_error_server)
                    ComposerError.TooLarge -> stringResource(Res.string.composer_error_too_large)
                    ComposerError.UnsupportedType -> stringResource(Res.string.composer_error_unsupported_type)
                },
            variant = TextVariant.Small,
            color = OmicronTheme.colors.foreground,
            modifier = Modifier.weight(1f),
        )
        if (error == ComposerError.Unauthorized) {
            Button(
                text = stringResource(Res.string.composer_sign_in),
                onClick = onSignIn,
                variant = ButtonVariant.Secondary,
                size = ButtonSize.Sm,
            )
        } else {
            Button(
                text = stringResource(Res.string.composer_retry),
                onClick = onRetry,
                variant = ButtonVariant.Secondary,
                size = ButtonSize.Sm,
            )
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun ComposerCoverSection(
    previewUrl: String?,
    hasCover: Boolean,
    upload: ImageUploadState,
    onPick: () -> Unit,
    onRemove: () -> Unit,
    onRetry: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(Res.string.composer_cover_label),
            variant = TextVariant.Small,
            color = OmicronTheme.colors.foreground,
        )
        var failed by remember(previewUrl) { mutableStateOf(false) }
        if (previewUrl != null && !failed) {
            AsyncImage(
                model = previewUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                onError = { failed = true },
                modifier =
                    Modifier.fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(OmicronTheme.radii.cardSmall)),
            )
        } else {
            Text(
                text =
                    stringResource(
                        if (failed) Res.string.composer_image_preview_failed
                        else Res.string.composer_cover_empty,
                    ),
                variant = TextVariant.Muted,
                color = OmicronTheme.colors.foreground,
            )
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Button(
                text = stringResource(Res.string.composer_set_cover),
                onClick = onPick,
                variant = ButtonVariant.Secondary,
                size = ButtonSize.Sm,
                modifier = Modifier.heightIn(min = 48.dp),
                enabled = upload != ImageUploadState.Uploading,
                leadingIcon = { Icon(RikkaIcons.Image, null, size = IconSize.Sm) },
            )
            if (hasCover) {
                Button(
                    text = stringResource(Res.string.composer_remove_cover),
                    onClick = onRemove,
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Sm,
                    modifier = Modifier.heightIn(min = 48.dp),
                    enabled = upload != ImageUploadState.Uploading,
                    leadingIcon = { Icon(RikkaIcons.Trash, null, size = IconSize.Sm) },
                )
            }
        }
        when (upload) {
            is ImageUploadState.Idle -> Unit
            is ImageUploadState.Uploading -> {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Spinner(size = SpinnerSize.Sm)
                    Text(
                        text = stringResource(Res.string.composer_uploading),
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.foreground,
                    )
                }
            }
            is ImageUploadState.Error -> {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text =
                            when (upload.error) {
                                ComposerError.Offline ->
                                    stringResource(Res.string.composer_error_offline)
                                ComposerError.MissingInstance ->
                                    stringResource(Res.string.composer_error_missing_instance)
                                ComposerError.Unauthorized ->
                                    stringResource(Res.string.composer_error_unauthorized)
                                ComposerError.NotFound ->
                                    stringResource(Res.string.composer_not_found_description)
                                ComposerError.Server ->
                                    stringResource(Res.string.composer_error_server)
                                ComposerError.TooLarge ->
                                    stringResource(Res.string.composer_error_too_large)
                                ComposerError.UnsupportedType ->
                                    stringResource(Res.string.composer_error_unsupported_type)
                            },
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.foreground,
                        modifier = Modifier.weight(1f),
                    )
                    if (upload.retryable) {
                        Button(
                            text = stringResource(Res.string.composer_retry),
                            onClick = onRetry,
                            variant = ButtonVariant.Secondary,
                            size = ButtonSize.Sm,
                        )
                    }
                }
            }
        }
    }
}

private fun List<ComposerBlock>.firstImageUrl(): String? =
    filterIsInstance<ComposerBlock.Image>().firstOrNull { it.url.isNotBlank() }?.url

@Composable
private fun ComposerUploadStatus(upload: ImageUploadState, onRetry: () -> Unit) {
    when (upload) {
        is ImageUploadState.Idle -> Unit
        is ImageUploadState.Uploading -> {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Spinner(size = SpinnerSize.Sm)
                Text(
                    text = stringResource(Res.string.composer_uploading),
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.foreground,
                )
            }
        }
        is ImageUploadState.Error -> {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text =
                        when (upload.error) {
                            ComposerError.Offline -> stringResource(Res.string.composer_error_offline)
                            ComposerError.MissingInstance -> stringResource(Res.string.composer_error_missing_instance)
                            ComposerError.Unauthorized -> stringResource(Res.string.composer_error_unauthorized)
                            ComposerError.NotFound -> stringResource(Res.string.composer_not_found_description)
                            ComposerError.Server -> stringResource(Res.string.composer_error_server)
                            ComposerError.TooLarge -> stringResource(Res.string.composer_error_too_large)
                            ComposerError.UnsupportedType -> stringResource(Res.string.composer_error_unsupported_type)
                        },
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.foreground,
                    modifier = Modifier.weight(1f),
                )
                if (upload.retryable) {
                    Button(
                        text = stringResource(Res.string.composer_retry),
                        onClick = onRetry,
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Sm,
                    )
                }
            }
        }
    }
}

@Composable
private fun ComposerBlockEditor(
    block: ComposerBlock,
    requestFocus: Boolean,
    onFocusHandled: () -> Unit,
    onBlockTextChange: (String, String) -> Unit,
    onListItemChange: (String, Int, String) -> Unit,
    onAddListItem: (String) -> Unit,
    onRemoveListItem: (String, Int) -> Unit,
    onRemoveBlock: (String) -> Unit,
    onImageAltChange: (String, String) -> Unit,
) {
    val focusRequester = remember(block.id) { FocusRequester() }
    LaunchedEffect(requestFocus) {
        if (requestFocus) {
            if (block !is ComposerBlock.Divider && block !is ComposerBlock.RawHtml)
                focusRequester.requestFocus()
            onFocusHandled()
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        ComposerBlockHeader(block, onRemove = { onRemoveBlock(block.id) })
        when (block) {
            is ComposerBlock.Paragraph ->
                ComposerTextRow(
                    value = block.text,
                    placeholder = stringResource(Res.string.composer_block_hint),
                    onChange = { onBlockTextChange(block.id, it) },
                    modifier = Modifier.focusRequester(focusRequester),
                )
            is ComposerBlock.Heading ->
                ComposerTextRow(
                    value = block.text,
                    placeholder = stringResource(Res.string.composer_heading_hint),
                    onChange = { onBlockTextChange(block.id, it) },
                    modifier = Modifier.focusRequester(focusRequester),
                    minLines = 1,
                    style =
                        TextStyle(
                            fontFamily = OmicronTheme.contentFontFamily,
                            fontSize = 24.sp,
                            lineHeight = 30.sp,
                            fontWeight = FontWeight.SemiBold,
                        ),
                )
            is ComposerBlock.Quote ->
                ComposerTextRow(
                    value = block.text,
                    placeholder = stringResource(Res.string.composer_quote_hint),
                    onChange = { onBlockTextChange(block.id, it) },
                    modifier = Modifier.focusRequester(focusRequester),
                    style =
                        TextStyle(
                            fontFamily = OmicronTheme.contentFontFamily,
                            fontSize = 18.sp,
                            lineHeight = 28.sp,
                            fontWeight = FontWeight.Medium,
                        ),
                )
            is ComposerBlock.Code ->
                ComposerTextRow(
                    value = block.text,
                    placeholder = stringResource(Res.string.composer_code_hint),
                    onChange = { onBlockTextChange(block.id, it) },
                    modifier = Modifier.focusRequester(focusRequester),
                    style =
                        TextStyle(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 14.sp,
                            lineHeight = 22.sp,
                        ),
                )
            is ComposerBlock.BulletList ->
                ComposerListEditor(
                    items = block.items,
                    onItemChange = { index, text -> onListItemChange(block.id, index, text) },
                    onAddItem = { onAddListItem(block.id) },
                    onRemoveItem = { index -> onRemoveListItem(block.id, index) },
                    focusRequester = focusRequester,
                )
            is ComposerBlock.OrderedList ->
                ComposerListEditor(
                    items = block.items,
                    onItemChange = { index, text -> onListItemChange(block.id, index, text) },
                    onAddItem = { onAddListItem(block.id) },
                    onRemoveItem = { index -> onRemoveListItem(block.id, index) },
                    focusRequester = focusRequester,
                )
            is ComposerBlock.Image ->
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    var failed by remember(block.id, block.url) { mutableStateOf(false) }
                    if (!failed) {
                        AsyncImage(
                            model = block.url,
                            contentDescription = block.alt,
                            onError = { failed = true },
                            modifier =
                                Modifier.fillMaxWidth()
                                    .clip(RoundedCornerShape(OmicronTheme.radii.cardSmall)),
                        )
                    } else {
                        Text(
                            text = stringResource(Res.string.composer_image_preview_failed),
                            variant = TextVariant.Muted,
                            color = OmicronTheme.colors.mutedForeground,
                        )
                    }
                    Input(
                        value = block.alt.orEmpty(),
                        onValueChange = { onImageAltChange(block.id, it) },
                        placeholder = stringResource(Res.string.composer_image_alt_hint),
                        label = stringResource(Res.string.composer_image_alt_hint),
                        modifier = Modifier.focusRequester(focusRequester).heightIn(min = 48.dp),
                    )
                }
            is ComposerBlock.Divider -> Separator(modifier = Modifier.padding(vertical = 12.dp))
            is ComposerBlock.RawHtml ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = stringResource(Res.string.composer_preserved),
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.foreground,
                    )
                    Text(
                        text = block.html.take(PRESERVED_PREVIEW_LENGTH),
                        variant = TextVariant.Muted,
                        color = OmicronTheme.colors.foreground,
                    )
                }
        }
    }
}

@Composable
private fun ComposerBlockHeader(block: ComposerBlock, onRemove: () -> Unit) {
    val type = block.type()
    val label =
        stringResource(
            type?.label()
                ?: if (block is ComposerBlock.Image) Res.string.composer_image_block
                else Res.string.composer_preserved_block,
        )
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            type?.icon()
                ?: if (block is ComposerBlock.Image) RikkaIcons.Image else RikkaIcons.FileText,
            null,
            size = IconSize.Sm,
            tint = OmicronTheme.colors.mutedForeground,
        )
        Text(
            text = label,
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
            modifier = Modifier.weight(1f),
        )
        var expanded by remember(block.id) { mutableStateOf(false) }
        val menuLabel = stringResource(Res.string.composer_block_options, label)
        DropdownMenu(
            expanded = expanded,
            onDismiss = { expanded = false },
            label = menuLabel,
            trigger = {
                IconButton(
                    icon = RikkaIcons.MoreHorizontal,
                    contentDescription = menuLabel,
                    onClick = { expanded = true },
                    modifier = Modifier.size(48.dp),
                )
            },
        ) {
            DropdownMenuItem(
                text = stringResource(Res.string.composer_remove_block),
                icon = RikkaIcons.Trash,
                color = OmicronTheme.colors.destructive,
                onClick = {
                    expanded = false
                    onRemove()
                },
            )
        }
    }
}

@Composable
private fun ComposerTextRow(
    value: String,
    placeholder: String,
    onChange: (String) -> Unit,
    modifier: Modifier,
    minLines: Int = 3,
    style: TextStyle =
        TextStyle(
            fontFamily = OmicronTheme.contentFontFamily,
            fontSize = 18.sp,
            lineHeight = 28.sp,
        ),
) {
    Textarea(
        value = value,
        onValueChange = onChange,
        placeholder = placeholder,
        label = placeholder,
        minLines = minLines,
        maxLines = Int.MAX_VALUE,
        modifier = modifier,
        style = style,
    )
}

@Composable
private fun ComposerListEditor(
    items: List<String>,
    onItemChange: (Int, String) -> Unit,
    onAddItem: () -> Unit,
    onRemoveItem: (Int) -> Unit,
    focusRequester: FocusRequester,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEachIndexed { index, item ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Textarea(
                    value = item,
                    onValueChange = { onItemChange(index, it) },
                    placeholder = stringResource(Res.string.composer_list_item_hint),
                    label = stringResource(Res.string.composer_list_item_hint),
                    minLines = 1,
                    maxLines = Int.MAX_VALUE,
                    modifier =
                        Modifier.weight(1f)
                            .then(
                                if (index == 0) Modifier.focusRequester(focusRequester)
                                else Modifier,
                            ),
                    style =
                        TextStyle(
                            fontFamily = OmicronTheme.contentFontFamily,
                            fontSize = 18.sp,
                            lineHeight = 28.sp,
                        ),
                )
                IconButton(
                    icon = RikkaIcons.X,
                    contentDescription = stringResource(Res.string.composer_remove_item),
                    onClick = { onRemoveItem(index) },
                    modifier = Modifier.size(48.dp),
                )
            }
        }
        Button(
            text = stringResource(Res.string.composer_add_item),
            onClick = onAddItem,
            variant = ButtonVariant.Secondary,
            size = ButtonSize.Sm,
            leadingIcon = { Icon(RikkaIcons.Plus, null, size = IconSize.Sm) },
            modifier = Modifier.heightIn(min = 48.dp),
        )
    }
}

private fun ComposerBlock.type(): ComposerBlockType? =
    when (this) {
        is ComposerBlock.Paragraph -> ComposerBlockType.Paragraph
        is ComposerBlock.Heading -> ComposerBlockType.Heading
        is ComposerBlock.Quote -> ComposerBlockType.Quote
        is ComposerBlock.Code -> ComposerBlockType.Code
        is ComposerBlock.BulletList -> ComposerBlockType.BulletList
        is ComposerBlock.OrderedList -> ComposerBlockType.OrderedList
        is ComposerBlock.Divider -> ComposerBlockType.Divider
        else -> null
    }

private const val PRESERVED_PREVIEW_LENGTH = 120
