package org.omicron.mobile.feature.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButton
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.input.Input
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.core.picker.rememberImagePickerLauncher
import org.omicron.mobile.domain.model.ComposerBlock
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.composer_add_block
import org.omicron.mobile.resources.composer_add_image
import org.omicron.mobile.resources.composer_add_item
import org.omicron.mobile.resources.composer_back
import org.omicron.mobile.resources.composer_block_bullet
import org.omicron.mobile.resources.composer_block_code
import org.omicron.mobile.resources.composer_block_divider
import org.omicron.mobile.resources.composer_block_heading
import org.omicron.mobile.resources.composer_block_ordered
import org.omicron.mobile.resources.composer_block_paragraph
import org.omicron.mobile.resources.composer_block_quote
import org.omicron.mobile.resources.composer_block_hint
import org.omicron.mobile.resources.composer_code_hint
import org.omicron.mobile.resources.composer_draft_badge
import org.omicron.mobile.resources.composer_error_missing_instance
import org.omicron.mobile.resources.composer_error_offline
import org.omicron.mobile.resources.composer_error_server
import org.omicron.mobile.resources.composer_error_too_large
import org.omicron.mobile.resources.composer_error_unauthorized
import org.omicron.mobile.resources.composer_error_unsupported_type
import org.omicron.mobile.resources.composer_heading_hint
import org.omicron.mobile.resources.composer_image_alt_hint
import org.omicron.mobile.resources.composer_language
import org.omicron.mobile.resources.composer_language_hint
import org.omicron.mobile.resources.composer_list_item_hint
import org.omicron.mobile.resources.composer_load_error_title
import org.omicron.mobile.resources.composer_loading
import org.omicron.mobile.resources.composer_not_found_description
import org.omicron.mobile.resources.composer_not_found_title
import org.omicron.mobile.resources.composer_preserved
import org.omicron.mobile.resources.composer_publish
import org.omicron.mobile.resources.composer_published_message
import org.omicron.mobile.resources.composer_quote_hint
import org.omicron.mobile.resources.composer_remove_block
import org.omicron.mobile.resources.composer_remove_item
import org.omicron.mobile.resources.composer_retry
import org.omicron.mobile.resources.composer_save_draft
import org.omicron.mobile.resources.composer_saved
import org.omicron.mobile.resources.composer_saving
import org.omicron.mobile.resources.composer_scheduled_badge
import org.omicron.mobile.resources.composer_sign_in
import org.omicron.mobile.resources.composer_summary
import org.omicron.mobile.resources.composer_summary_hint
import org.omicron.mobile.resources.composer_tags
import org.omicron.mobile.resources.composer_tags_hint
import org.omicron.mobile.resources.composer_title_edit
import org.omicron.mobile.resources.composer_title_hint
import org.omicron.mobile.resources.composer_title_new
import org.omicron.mobile.resources.composer_uploading
import org.omicron.mobile.resources.composer_validation_body
import org.omicron.mobile.resources.composer_validation_title
import org.omicron.mobile.resources.composer_view_post

@Composable
fun ComposerRoute(
    viewModel: ComposerViewModel,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onPublished: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    val launchPicker = rememberImagePickerLauncher { bytes, mime -> viewModel.pickImageResult(bytes, mime) }
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
        onImageAltChange = viewModel::updateImageAlt,
        onRetryImageUpload = viewModel::retryImageUpload,
        onSaveDraft = viewModel::saveDraft,
        onPublish = viewModel::publish,
        onRetryLoad = viewModel::retryLoad,
        onRetrySave = viewModel::retrySave,
    )
}

@Composable
private fun ComposerScreen(
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
    onImageAltChange: (String, String) -> Unit,
    onRetryImageUpload: () -> Unit,
    onSaveDraft: () -> Unit,
    onPublish: () -> Unit,
    onRetryLoad: () -> Unit,
    onRetrySave: () -> Unit,
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
                contentDescription = stringResource(Res.string.composer_back),
                onClick = onBack,
                size = IconButtonSize.Default,
            )
            Text(
                text = stringResource(if (state.postId == null) Res.string.composer_title_new else Res.string.composer_title_edit),
                variant = TextVariant.H2,
                color = OmicronTheme.colors.foreground,
            )
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
                    onSignIn = onSignIn,
                    onPublished = onPublished,
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
                    onImageAltChange = onImageAltChange,
                    onRetryImageUpload = onRetryImageUpload,
                    onSaveDraft = onSaveDraft,
                    onPublish = onPublish,
                    onRetrySave = onRetrySave,
                )
        }
    }
}

@Composable
private fun ComposerLoading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Spinner(size = SpinnerSize.Default)
            Text(
                text = stringResource(Res.string.composer_loading),
                variant = TextVariant.Muted,
                color = OmicronTheme.colors.foreground,
            )
        }
    }
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
    onImageAltChange: (String, String) -> Unit,
    onRetryImageUpload: () -> Unit,
    onSaveDraft: () -> Unit,
    onPublish: () -> Unit,
    onRetrySave: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "actions") {
            ComposerActions(
                state = state,
                onSaveDraft = onSaveDraft,
                onPublish = onPublish,
            )
        }
        item(key = "status") {
            ComposerStatus(
                state = state,
                onSignIn = onSignIn,
                onPublished = onPublished,
                onRetrySave = onRetrySave,
            )
        }
        item(key = "title") {
            Input(
                value = state.title,
                onValueChange = onTitleChange,
                placeholder = stringResource(Res.string.composer_title_hint),
                label = stringResource(Res.string.composer_title_hint),
            )
        }
        items(state.blocks, key = { it.id }, contentType = { it.javaClass.simpleName }) { block ->
            ComposerBlockEditor(
                block = block,
                onBlockTextChange = onBlockTextChange,
                onListItemChange = onListItemChange,
                onAddListItem = onAddListItem,
                onRemoveListItem = onRemoveListItem,
                onRemoveBlock = onRemoveBlock,
                onImageAltChange = onImageAltChange,
            )
        }
        item(key = "upload") {
            ComposerUploadStatus(
                upload = state.imageUpload,
                onRetry = onRetryImageUpload,
            )
        }
        item(key = "add") {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = stringResource(Res.string.composer_add_block),
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.foreground,
                )
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ComposerBlockType.entries.forEach { type ->
                        Button(
                            text = stringResource(type.label()),
                            onClick = { onAddBlock(type) },
                            variant = ButtonVariant.Secondary,
                            size = ButtonSize.Sm,
                        )
                    }
                    Button(
                        text = stringResource(Res.string.composer_add_image),
                        onClick = onPickImage,
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Sm,
                    )
                }
            }
        }
        item(key = "meta") {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Input(
                    value = state.summary,
                    onValueChange = onSummaryChange,
                    placeholder = stringResource(Res.string.composer_summary_hint),
                    label = stringResource(Res.string.composer_summary),
                    singleLine = false,
                    maxLength = SUMMARY_MAX_LENGTH,
                    showCharCount = true,
                )
                Input(
                    value = state.tags,
                    onValueChange = onTagsChange,
                    placeholder = stringResource(Res.string.composer_tags_hint),
                    label = stringResource(Res.string.composer_tags),
                )
                Input(
                    value = state.language,
                    onValueChange = onLanguageChange,
                    placeholder = stringResource(Res.string.composer_language_hint),
                    label = stringResource(Res.string.composer_language),
                )
            }
        }
    }
}

@Composable
private fun ComposerActions(state: ComposerUiState, onSaveDraft: () -> Unit, onPublish: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (state.postId != null) {
            Text(
                text =
                    stringResource(
                        if (state.sourceStatus == OwnPostStatus.Scheduled) {
                            Res.string.composer_scheduled_badge
                        } else {
                            Res.string.composer_draft_badge
                        },
                    ),
                variant = TextVariant.Small,
                color = OmicronTheme.colors.foreground,
            )
        }
        Box(modifier = Modifier.weight(1f))
        Button(
            text = stringResource(Res.string.composer_save_draft),
            onClick = onSaveDraft,
            variant = ButtonVariant.Secondary,
            size = ButtonSize.Sm,
            loading = state.save == ComposerSave.Saving,
        )
        Button(
            text = stringResource(Res.string.composer_publish),
            onClick = onPublish,
            size = ButtonSize.Sm,
            loading = state.publish == ComposerPublish.Publishing,
        )
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
    when {
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
                        if (publish.issue == PublishIssue.MissingTitle) {
                            Res.string.composer_validation_title
                        } else {
                            Res.string.composer_validation_body
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
                text = stringResource(Res.string.composer_saved),
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
    onBlockTextChange: (String, String) -> Unit,
    onListItemChange: (String, Int, String) -> Unit,
    onAddListItem: (String) -> Unit,
    onRemoveListItem: (String, Int) -> Unit,
    onRemoveBlock: (String) -> Unit,
    onImageAltChange: (String, String) -> Unit,
) {
    when (block) {
        is ComposerBlock.Paragraph ->
            ComposerTextRow(
                value = block.text,
                placeholder = stringResource(Res.string.composer_block_hint),
                onChange = { onBlockTextChange(block.id, it) },
                onRemove = { onRemoveBlock(block.id) },
            )
        is ComposerBlock.Heading ->
            ComposerTextRow(
                value = block.text,
                placeholder = stringResource(Res.string.composer_heading_hint),
                onChange = { onBlockTextChange(block.id, it) },
                onRemove = { onRemoveBlock(block.id) },
            )
        is ComposerBlock.Quote ->
            ComposerTextRow(
                value = block.text,
                placeholder = stringResource(Res.string.composer_quote_hint),
                onChange = { onBlockTextChange(block.id, it) },
                onRemove = { onRemoveBlock(block.id) },
            )
        is ComposerBlock.Code ->
            ComposerTextRow(
                value = block.text,
                placeholder = stringResource(Res.string.composer_code_hint),
                onChange = { onBlockTextChange(block.id, it) },
                onRemove = { onRemoveBlock(block.id) },
            )
        is ComposerBlock.BulletList ->
            ComposerListEditor(
                items = block.items,
                onItemChange = { index, text -> onListItemChange(block.id, index, text) },
                onAddItem = { onAddListItem(block.id) },
                onRemoveItem = { index -> onRemoveListItem(block.id, index) },
                onRemoveBlock = { onRemoveBlock(block.id) },
            )
        is ComposerBlock.OrderedList ->
            ComposerListEditor(
                items = block.items,
                onItemChange = { index, text -> onListItemChange(block.id, index, text) },
                onAddItem = { onAddListItem(block.id) },
                onRemoveItem = { index -> onRemoveListItem(block.id, index) },
                onRemoveBlock = { onRemoveBlock(block.id) },
            )
        is ComposerBlock.Image ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                var failed by remember(block.id, block.url) { mutableStateOf(false) }
                if (!failed) {
                    AsyncImage(
                        model = block.url,
                        contentDescription = block.alt,
                        onError = { failed = true },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Input(
                        value = block.alt.orEmpty(),
                        onValueChange = { onImageAltChange(block.id, it) },
                        placeholder = stringResource(Res.string.composer_image_alt_hint),
                        label = stringResource(Res.string.composer_image_alt_hint),
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(
                        icon = RikkaIcons.X,
                        contentDescription = stringResource(Res.string.composer_remove_block),
                        onClick = { onRemoveBlock(block.id) },
                    )
                }
            }
        is ComposerBlock.Divider ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier =
                        Modifier
                            .weight(1f)
                            .height(1.dp)
                            .background(OmicronTheme.colors.line),
                )
                IconButton(
                    icon = RikkaIcons.X,
                    contentDescription = stringResource(Res.string.composer_remove_block),
                    onClick = { onRemoveBlock(block.id) },
                )
            }
        is ComposerBlock.RawHtml ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
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
                IconButton(
                    icon = RikkaIcons.X,
                    contentDescription = stringResource(Res.string.composer_remove_block),
                    onClick = { onRemoveBlock(block.id) },
                )
            }
    }
}

@Composable
private fun ComposerTextRow(value: String, placeholder: String, onChange: (String) -> Unit, onRemove: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Input(
            value = value,
            onValueChange = onChange,
            placeholder = placeholder,
            label = placeholder,
            singleLine = false,
            modifier = Modifier.weight(1f),
        )
        IconButton(
            icon = RikkaIcons.X,
            contentDescription = stringResource(Res.string.composer_remove_block),
            onClick = onRemove,
        )
    }
}

@Composable
private fun ComposerListEditor(
    items: List<String>,
    onItemChange: (Int, String) -> Unit,
    onAddItem: () -> Unit,
    onRemoveItem: (Int) -> Unit,
    onRemoveBlock: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEachIndexed { index, item ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Input(
                    value = item,
                    onValueChange = { onItemChange(index, it) },
                    placeholder = stringResource(Res.string.composer_list_item_hint),
                    label = stringResource(Res.string.composer_list_item_hint),
                    singleLine = false,
                    modifier = Modifier.weight(1f),
                )
                IconButton(
                    icon = RikkaIcons.X,
                    contentDescription = stringResource(Res.string.composer_remove_item),
                    onClick = { onRemoveItem(index) },
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                text = stringResource(Res.string.composer_add_item),
                onClick = onAddItem,
                variant = ButtonVariant.Secondary,
                size = ButtonSize.Sm,
            )
            Button(
                text = stringResource(Res.string.composer_remove_block),
                onClick = onRemoveBlock,
                variant = ButtonVariant.Ghost,
                size = ButtonSize.Sm,
            )
        }
    }
}

private fun ComposerBlockType.label() =
    when (this) {
        ComposerBlockType.Paragraph -> Res.string.composer_block_paragraph
        ComposerBlockType.Heading -> Res.string.composer_block_heading
        ComposerBlockType.Quote -> Res.string.composer_block_quote
        ComposerBlockType.Code -> Res.string.composer_block_code
        ComposerBlockType.BulletList -> Res.string.composer_block_bullet
        ComposerBlockType.OrderedList -> Res.string.composer_block_ordered
        ComposerBlockType.Divider -> Res.string.composer_block_divider
    }

private const val SUMMARY_MAX_LENGTH = 150
private const val PRESERVED_PREVIEW_LENGTH = 120
