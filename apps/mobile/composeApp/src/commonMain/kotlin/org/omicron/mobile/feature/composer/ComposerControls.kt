package org.omicron.mobile.feature.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.collapsible.Collapsible
import org.omicron.mobile.core.designsystem.rikkaui.collapsible.CollapsibleContent
import org.omicron.mobile.core.designsystem.rikkaui.collapsible.CollapsibleTrigger
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.input.Input
import org.omicron.mobile.core.designsystem.rikkaui.separator.Separator
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.core.designsystem.rikkaui.textarea.Textarea
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.composer_add_block
import org.omicron.mobile.resources.composer_add_image
import org.omicron.mobile.resources.composer_block_bullet
import org.omicron.mobile.resources.composer_block_code
import org.omicron.mobile.resources.composer_block_divider
import org.omicron.mobile.resources.composer_block_heading
import org.omicron.mobile.resources.composer_block_ordered
import org.omicron.mobile.resources.composer_block_paragraph
import org.omicron.mobile.resources.composer_block_quote
import org.omicron.mobile.resources.composer_details
import org.omicron.mobile.resources.composer_details_collapsed
import org.omicron.mobile.resources.composer_details_expanded
import org.omicron.mobile.resources.composer_details_hint
import org.omicron.mobile.resources.composer_language
import org.omicron.mobile.resources.composer_language_hint
import org.omicron.mobile.resources.composer_summary
import org.omicron.mobile.resources.composer_summary_hint
import org.omicron.mobile.resources.composer_tags
import org.omicron.mobile.resources.composer_tags_hint

@Composable
internal fun ComposerDetails(
    state: ComposerUiState,
    open: Boolean,
    onOpenChange: (Boolean) -> Unit,
    onSummaryChange: (String) -> Unit,
    onTagsChange: (String) -> Unit,
    onLanguageChange: (String) -> Unit,
    cover: @Composable () -> Unit,
) {
    Collapsible {
        CollapsibleTrigger(
            onClick = { onOpenChange(!open) },
            label = stringResource(Res.string.composer_details),
            expanded = open,
            expandedLabel = stringResource(Res.string.composer_details_expanded),
            collapsedLabel = stringResource(Res.string.composer_details_collapsed),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    RikkaIcons.Settings,
                    null,
                    tint = OmicronTheme.colors.mutedForeground,
                    size = IconSize.Default,
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = stringResource(Res.string.composer_details),
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.foreground,
                    )
                    Text(
                        text = stringResource(Res.string.composer_details_hint),
                        variant = TextVariant.Muted,
                        color = OmicronTheme.colors.mutedForeground,
                    )
                }
                Icon(
                    if (open) RikkaIcons.ChevronUp else RikkaIcons.ChevronDown,
                    null,
                    tint = OmicronTheme.colors.mutedForeground,
                    size = IconSize.Sm,
                )
            }
        }
        CollapsibleContent(open = open) {
            Column(
                Modifier.padding(top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                cover()
                ComposerFieldLabel(stringResource(Res.string.composer_summary)) {
                    Textarea(
                        value = state.summary,
                        onValueChange = onSummaryChange,
                        placeholder = stringResource(Res.string.composer_summary_hint),
                        label = stringResource(Res.string.composer_summary),
                        minLines = 2,
                        maxLines = Int.MAX_VALUE,
                        maxLength = 150,
                        showCharCount = true,
                    )
                }
                ComposerFieldLabel(stringResource(Res.string.composer_tags)) {
                    Input(
                        value = state.tags,
                        onValueChange = onTagsChange,
                        placeholder = stringResource(Res.string.composer_tags_hint),
                        label = stringResource(Res.string.composer_tags),
                        modifier = Modifier.heightIn(min = 48.dp),
                    )
                }
                ComposerFieldLabel(stringResource(Res.string.composer_language)) {
                    Input(
                        value = state.language,
                        onValueChange = onLanguageChange,
                        placeholder = stringResource(Res.string.composer_language_hint),
                        label = stringResource(Res.string.composer_language),
                        modifier = Modifier.heightIn(min = 48.dp),
                        leadingIcon = RikkaIcons.Languages,
                    )
                }
                Separator()
            }
        }
    }
}

@Composable
private fun ComposerFieldLabel(label: String, field: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = label, variant = TextVariant.Small, color = OmicronTheme.colors.foreground)
        field()
    }
}

@Composable
internal fun ComposerToolbar(
    onAddBlock: (ComposerBlockType) -> Unit,
    onPickImage: () -> Unit,
    enabled: Boolean,
) {
    Column(Modifier.fillMaxWidth().background(OmicronTheme.colors.backgroundAlt)) {
        Separator()
        Text(
            text = stringResource(Res.string.composer_add_block),
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
            modifier = Modifier.padding(start = 16.dp, top = 8.dp),
        )
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            ComposerBlockType.entries.forEach { type ->
                ComposerTool(
                    label = stringResource(type.label()),
                    icon = type.icon(),
                    onClick = { onAddBlock(type) },
                )
            }
            ComposerTool(
                label = stringResource(Res.string.composer_add_image),
                icon = RikkaIcons.Image,
                onClick = onPickImage,
                enabled = enabled,
            )
        }
    }
}

@Composable
private fun ComposerTool(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    enabled: Boolean = true,
) {
    Button(
        onClick = onClick,
        label = label,
        variant = ButtonVariant.Ghost,
        size = ButtonSize.Sm,
        enabled = enabled,
        modifier = Modifier.widthIn(min = 56.dp).heightIn(min = 48.dp),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(icon, null, size = IconSize.Default)
            Text(text = label, style = TextStyle(fontSize = 12.sp, lineHeight = 16.sp))
        }
    }
}

internal fun ComposerBlockType.label(): StringResource =
    when (this) {
        ComposerBlockType.Paragraph -> Res.string.composer_block_paragraph
        ComposerBlockType.Heading -> Res.string.composer_block_heading
        ComposerBlockType.Quote -> Res.string.composer_block_quote
        ComposerBlockType.Code -> Res.string.composer_block_code
        ComposerBlockType.BulletList -> Res.string.composer_block_bullet
        ComposerBlockType.OrderedList -> Res.string.composer_block_ordered
        ComposerBlockType.Divider -> Res.string.composer_block_divider
    }

internal fun ComposerBlockType.icon(): ImageVector =
    when (this) {
        ComposerBlockType.Paragraph -> RikkaIcons.Pilcrow
        ComposerBlockType.Heading -> RikkaIcons.Heading
        ComposerBlockType.Quote -> RikkaIcons.Quote
        ComposerBlockType.Code -> RikkaIcons.CodeXml
        ComposerBlockType.BulletList -> RikkaIcons.List
        ComposerBlockType.OrderedList -> RikkaIcons.ListOrdered
        ComposerBlockType.Divider -> RikkaIcons.Minus
    }
