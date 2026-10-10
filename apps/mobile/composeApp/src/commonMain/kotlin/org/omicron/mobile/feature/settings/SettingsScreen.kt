package org.omicron.mobile.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
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
import org.omicron.mobile.domain.model.AppearancePreference
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.settings_about_description
import org.omicron.mobile.resources.settings_about_license
import org.omicron.mobile.resources.settings_about_title
import org.omicron.mobile.resources.settings_account_description
import org.omicron.mobile.resources.settings_account_title
import org.omicron.mobile.resources.settings_appearance_dark
import org.omicron.mobile.resources.settings_appearance_description
import org.omicron.mobile.resources.settings_appearance_light
import org.omicron.mobile.resources.settings_appearance_save_error
import org.omicron.mobile.resources.settings_appearance_system
import org.omicron.mobile.resources.settings_appearance_title
import org.omicron.mobile.resources.settings_back
import org.omicron.mobile.resources.settings_change_instance
import org.omicron.mobile.resources.settings_instance_description
import org.omicron.mobile.resources.settings_instance_missing
import org.omicron.mobile.resources.settings_instance_title
import org.omicron.mobile.resources.settings_loading
import org.omicron.mobile.resources.settings_offline_reading_description
import org.omicron.mobile.resources.settings_offline_reading_open
import org.omicron.mobile.resources.settings_offline_reading_title
import org.omicron.mobile.resources.settings_retry
import org.omicron.mobile.resources.settings_sign_in
import org.omicron.mobile.resources.settings_sign_out
import org.omicron.mobile.resources.settings_sign_out_warning
import org.omicron.mobile.resources.settings_signing_out
import org.omicron.mobile.resources.settings_title
import org.omicron.mobile.resources.timeline_session_expired

@Composable
fun SettingsRoute(
    viewModel: SettingsViewModel,
    onBack: () -> Unit,
    onChangeInstance: () -> Unit,
    onSignIn: () -> Unit,
    onOpenOfflineReading: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    SettingsScreen(
        state = state,
        onBack = onBack,
        onChangeInstance = onChangeInstance,
        onSignIn = onSignIn,
        onOpenOfflineReading = onOpenOfflineReading,
        onSetAppearance = viewModel::setAppearance,
        onRetryAppearanceSave = viewModel::retryAppearanceSave,
        onSignOut = viewModel::signOut,
    )
}

@Composable
private fun SettingsScreen(
    state: SettingsUiState,
    onBack: () -> Unit,
    onChangeInstance: () -> Unit,
    onSignIn: () -> Unit,
    onOpenOfflineReading: () -> Unit,
    onSetAppearance: (AppearancePreference) -> Unit,
    onRetryAppearanceSave: () -> Unit,
    onSignOut: () -> Unit,
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
                contentDescription = stringResource(Res.string.settings_back),
                onClick = onBack,
                size = IconButtonSize.Default,
            )
            Text(
                text = stringResource(Res.string.settings_title),
                variant = TextVariant.H2,
                color = OmicronTheme.colors.foreground,
            )
        }
        if (state.sessionExpired) {
            SessionExpiredNotice(message = stringResource(Res.string.timeline_session_expired), onSignIn = onSignIn)
        }
        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Spinner(size = SpinnerSize.Default, label = stringResource(Res.string.settings_loading))
            }
        } else {
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SettingsSection(title = stringResource(Res.string.settings_instance_title)) {
                    val instance = state.instance
                    Text(
                        text =
                            if (instance == null) {
                                stringResource(Res.string.settings_instance_missing)
                            } else {
                                stringResource(Res.string.settings_instance_description, instance.name, instance.domain)
                            },
                        variant = TextVariant.P,
                        color = OmicronTheme.colors.foregroundAlt,
                    )
                    Button(
                        text = stringResource(Res.string.settings_change_instance),
                        onClick = onChangeInstance,
                        variant = ButtonVariant.Outline,
                    )
                }
                SettingsSection(
                    title = stringResource(Res.string.settings_appearance_title),
                    description = stringResource(Res.string.settings_appearance_description),
                ) {
                    AppearanceChoices(
                        selected = state.appearance,
                        enabled = !state.isSavingAppearance,
                        onSelect = onSetAppearance,
                    )
                    if (state.appearanceSaveFailed) {
                        Text(
                            text = stringResource(Res.string.settings_appearance_save_error),
                            variant = TextVariant.Small,
                            color = OmicronTheme.colors.destructive,
                        )
                        Button(
                            text = stringResource(Res.string.settings_retry),
                            onClick = onRetryAppearanceSave,
                            size = ButtonSize.Sm,
                            variant = ButtonVariant.Outline,
                        )
                    }
                }
                SettingsSection(
                    title = stringResource(Res.string.settings_offline_reading_title),
                    description = stringResource(Res.string.settings_offline_reading_description),
                ) {
                    Button(
                        text = stringResource(Res.string.settings_offline_reading_open),
                        onClick = onOpenOfflineReading,
                        variant = ButtonVariant.Outline,
                    )
                }
                SettingsSection(title = stringResource(Res.string.settings_about_title)) {
                    Text(
                        text = stringResource(Res.string.settings_about_description),
                        variant = TextVariant.P,
                        color = OmicronTheme.colors.foregroundAlt,
                    )
                    Text(
                        text = stringResource(Res.string.settings_about_license),
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.mutedForeground,
                    )
                }
                SettingsSection(title = stringResource(Res.string.settings_account_title)) {
                    val user = state.user
                    if (state.signOutWarning) {
                        Text(
                            text = stringResource(Res.string.settings_sign_out_warning),
                            variant = TextVariant.Small,
                            color = OmicronTheme.colors.destructive,
                        )
                    }
                    if (user != null) {
                        Text(
                            text = stringResource(Res.string.settings_account_description, user.displayName, user.username),
                            variant = TextVariant.P,
                            color = OmicronTheme.colors.foregroundAlt,
                        )
                        Button(
                            text = stringResource(if (state.isSigningOut) Res.string.settings_signing_out else Res.string.settings_sign_out),
                            onClick = onSignOut,
                            enabled = !state.isSigningOut,
                            loading = state.isSigningOut,
                            variant = ButtonVariant.Outline,
                        )
                    } else if (!state.sessionExpired) {
                        Button(text = stringResource(Res.string.settings_sign_in), onClick = onSignIn, variant = ButtonVariant.Outline)
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun AppearanceChoices(
    selected: AppearancePreference,
    enabled: Boolean,
    onSelect: (AppearancePreference) -> Unit,
) {
    val options =
        listOf(
            AppearancePreference.System to Res.string.settings_appearance_system,
            AppearancePreference.Light to Res.string.settings_appearance_light,
            AppearancePreference.Dark to Res.string.settings_appearance_dark,
        )
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (preference, label) ->
            Button(
                text = stringResource(label),
                onClick = { onSelect(preference) },
                enabled = enabled,
                selected = preference == selected,
                role = Role.RadioButton,
                variant = if (preference == selected) ButtonVariant.Secondary else ButtonVariant.Outline,
            )
        }
    }
}

@Composable
private fun SettingsSection(
    title: String,
    description: String? = null,
    content: @Composable () -> Unit,
) {
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .background(OmicronTheme.colors.backgroundAlt, RoundedCornerShape(OmicronTheme.radii.card))
                .border(1.dp, OmicronTheme.colors.borderCard, RoundedCornerShape(OmicronTheme.radii.card))
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(text = title, variant = TextVariant.H3, color = OmicronTheme.colors.foreground)
        description?.let { Text(text = it, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground) }
        content()
    }
}
