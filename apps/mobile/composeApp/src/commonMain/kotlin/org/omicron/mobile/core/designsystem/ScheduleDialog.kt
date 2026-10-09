package org.omicron.mobile.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import kotlinx.datetime.TimeZone
import kotlin.time.Clock
import kotlin.time.Instant
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.input.Input
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.core.time.formatScheduledFor
import org.omicron.mobile.core.time.isSchedulable
import org.omicron.mobile.core.time.parseScheduleInput
import org.omicron.mobile.core.time.schedulePresets
import org.omicron.mobile.core.time.toScheduleInput
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.schedule_cancel
import org.omicron.mobile.resources.schedule_confirm
import org.omicron.mobile.resources.schedule_date
import org.omicron.mobile.resources.schedule_date_hint
import org.omicron.mobile.resources.schedule_description
import org.omicron.mobile.resources.schedule_dialog_title
import org.omicron.mobile.resources.schedule_error_invalid
import org.omicron.mobile.resources.schedule_error_past
import org.omicron.mobile.resources.schedule_pick_prompt
import org.omicron.mobile.resources.schedule_preset_hour
import org.omicron.mobile.resources.schedule_preset_monday
import org.omicron.mobile.resources.schedule_preset_tomorrow
import org.omicron.mobile.resources.schedule_reschedule_confirm
import org.omicron.mobile.resources.schedule_reschedule_title
import org.omicron.mobile.resources.schedule_time
import org.omicron.mobile.resources.schedule_time_hint
import org.omicron.mobile.resources.schedule_unschedule

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ScheduleDialog(
    current: String?,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
    onUnschedule: () -> Unit,
) {
    val zone = remember { TimeZone.currentSystemDefault() }
    val presets = remember { schedulePresets(Clock.System, zone) }
    val presetLabels =
        listOf(
            Res.string.schedule_preset_hour,
            Res.string.schedule_preset_tomorrow,
            Res.string.schedule_preset_monday,
        )
    val seeded =
        remember(current) {
            current?.let { runCatching { Instant.parse(it) }.getOrNull()?.toScheduleInput(zone) }
                ?: presets[1].toScheduleInput(zone)
        }
    var date by remember(current) { mutableStateOf(seeded.first) }
    var time by remember(current) { mutableStateOf(seeded.second) }
    var error by remember(current) { mutableStateOf<ScheduleDialogError?>(null) }
    val preview = parseScheduleInput(date.trim(), time.trim(), zone)?.let { formatScheduledFor(it.toString(), zone) }
    Box(
        modifier =
            Modifier.fillMaxSize().background(OmicronTheme.colors.dark40)
                .clickable(role = Role.Button, onClick = onDismiss),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier =
                Modifier.padding(24.dp).fillMaxWidth()
                    .background(OmicronTheme.colors.background, RoundedCornerShape(OmicronTheme.radii.card))
                    .clickable(role = Role.Button, onClick = {})
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(if (current != null) Res.string.schedule_reschedule_title else Res.string.schedule_dialog_title),
                variant = TextVariant.H3,
                color = OmicronTheme.colors.foreground,
            )
            Text(
                text = stringResource(Res.string.schedule_description),
                variant = TextVariant.Muted,
                color = OmicronTheme.colors.foreground,
            )
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                presets.forEachIndexed { index, preset ->
                    Button(
                        text = stringResource(presetLabels[index]),
                        onClick = {
                            val next = preset.toScheduleInput(zone)
                            date = next.first
                            time = next.second
                            error = null
                        },
                        variant = ButtonVariant.Outline,
                        size = ButtonSize.Sm,
                    )
                }
            }
            Input(
                value = date,
                onValueChange = { date = it },
                placeholder = stringResource(Res.string.schedule_date_hint),
                label = stringResource(Res.string.schedule_date),
            )
            Input(
                value = time,
                onValueChange = { time = it },
                placeholder = stringResource(Res.string.schedule_time_hint),
                label = stringResource(Res.string.schedule_time),
            )
            Text(
                text = preview ?: stringResource(Res.string.schedule_pick_prompt),
                variant = TextVariant.Muted,
                color = OmicronTheme.colors.foreground,
            )
            if (error != null) {
                Text(
                    text =
                        stringResource(
                            if (error == ScheduleDialogError.Invalid) {
                                Res.string.schedule_error_invalid
                            } else {
                                Res.string.schedule_error_past
                            },
                        ),
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.destructive,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (current != null) {
                    Button(
                        text = stringResource(Res.string.schedule_unschedule),
                        onClick = onUnschedule,
                        variant = ButtonVariant.Ghost,
                        size = ButtonSize.Sm,
                    )
                }
                Box(modifier = Modifier.weight(1f))
                Button(
                    text = stringResource(Res.string.schedule_cancel),
                    onClick = onDismiss,
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Sm,
                )
                Button(
                    text =
                        stringResource(
                            if (current != null) Res.string.schedule_reschedule_confirm else Res.string.schedule_confirm,
                        ),
                    onClick = {
                        val instant = parseScheduleInput(date.trim(), time.trim(), zone)
                        if (instant == null) {
                            error = ScheduleDialogError.Invalid
                        } else if (!instant.isSchedulable(Clock.System)) {
                            error = ScheduleDialogError.Past
                        } else {
                            onConfirm(instant.toString())
                        }
                    },
                    size = ButtonSize.Sm,
                )
            }
        }
    }
}

private enum class ScheduleDialogError {
    Invalid,
    Past,
}
