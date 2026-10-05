package org.omicron.mobile.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.input.Input
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.auth_change_to_register
import org.omicron.mobile.resources.auth_change_to_sign_in
import org.omicron.mobile.resources.auth_display_name
import org.omicron.mobile.resources.auth_email
import org.omicron.mobile.resources.auth_error_display_name_too_long
import org.omicron.mobile.resources.auth_error_email_already_registered
import org.omicron.mobile.resources.auth_error_identifier_required
import org.omicron.mobile.resources.auth_error_invalid_email
import org.omicron.mobile.resources.auth_error_invalid_username
import org.omicron.mobile.resources.auth_error_missing_instance
import org.omicron.mobile.resources.auth_error_password_too_long
import org.omicron.mobile.resources.auth_error_password_too_short
import org.omicron.mobile.resources.auth_error_passwords_do_not_match
import org.omicron.mobile.resources.auth_error_request_failed
import org.omicron.mobile.resources.auth_error_unavailable
import org.omicron.mobile.resources.auth_password
import org.omicron.mobile.resources.auth_password_confirmation
import org.omicron.mobile.resources.auth_register
import org.omicron.mobile.resources.auth_register_description
import org.omicron.mobile.resources.auth_register_title
import org.omicron.mobile.resources.auth_restoring
import org.omicron.mobile.resources.auth_session_not_found_description
import org.omicron.mobile.resources.auth_session_not_found_title
import org.omicron.mobile.resources.auth_sign_in
import org.omicron.mobile.resources.auth_sign_in_description
import org.omicron.mobile.resources.auth_sign_in_title
import org.omicron.mobile.resources.auth_signed_in_description
import org.omicron.mobile.resources.auth_signed_in_title
import org.omicron.mobile.resources.auth_sign_out
import org.omicron.mobile.resources.auth_try_again
import org.omicron.mobile.resources.auth_username
import org.omicron.mobile.resources.auth_username_or_email
import org.omicron.mobile.resources.auth_verification_description
import org.omicron.mobile.resources.auth_verification_description_without_email
import org.omicron.mobile.resources.auth_verification_title
import org.omicron.mobile.resources.connect_change_instance
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun AuthRoute(
    viewModel: AuthViewModel,
    onChangeInstance: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    AuthScreen(
        state = state,
        onRetry = viewModel::restore,
        onChangeInstance = onChangeInstance,
        onIdentifierChange = viewModel::updateIdentifier,
        onUsernameChange = viewModel::updateUsername,
        onEmailChange = viewModel::updateEmail,
        onDisplayNameChange = viewModel::updateDisplayName,
        onPasswordChange = viewModel::updatePassword,
        onConfirmationChange = viewModel::updateConfirmation,
        onShowSignIn = viewModel::showSignIn,
        onShowRegistration = viewModel::showRegistration,
        onSignIn = viewModel::signIn,
        onRegister = viewModel::register,
        onSignOut = viewModel::signOut,
    )
}

@Composable
private fun AuthScreen(
    state: AuthUiState,
    onRetry: () -> Unit,
    onChangeInstance: () -> Unit,
    onIdentifierChange: (String) -> Unit,
    onUsernameChange: (String) -> Unit,
    onEmailChange: (String) -> Unit,
    onDisplayNameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onConfirmationChange: (String) -> Unit,
    onShowSignIn: () -> Unit,
    onShowRegistration: () -> Unit,
    onSignIn: () -> Unit,
    onRegister: () -> Unit,
    onSignOut: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize().background(RikkaTheme.colors.background).safeDrawingPadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().widthIn(max = 480.dp).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            when (val phase = state.phase) {
                AuthPhase.Restoring -> Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.auth_restoring))
                is AuthPhase.Credentials ->
                    CredentialsForm(
                        phase = phase,
                        onIdentifierChange = onIdentifierChange,
                        onUsernameChange = onUsernameChange,
                        onEmailChange = onEmailChange,
                        onDisplayNameChange = onDisplayNameChange,
                        onPasswordChange = onPasswordChange,
                        onConfirmationChange = onConfirmationChange,
                        onShowSignIn = onShowSignIn,
                        onShowRegistration = onShowRegistration,
                        onSignIn = onSignIn,
                        onRegister = onRegister,
                    )

                is AuthPhase.SignedIn -> SignedIn(phase, onSignOut, onChangeInstance)
                is AuthPhase.VerificationRequired -> VerificationRequired(phase, onShowSignIn, onChangeInstance)
                is AuthPhase.Error -> AuthError(phase.error, onRetry, onChangeInstance)
            }
        }
    }
}

@Composable
private fun CredentialsForm(
    phase: AuthPhase.Credentials,
    onIdentifierChange: (String) -> Unit,
    onUsernameChange: (String) -> Unit,
    onEmailChange: (String) -> Unit,
    onDisplayNameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onConfirmationChange: (String) -> Unit,
    onShowSignIn: () -> Unit,
    onShowRegistration: () -> Unit,
    onSignIn: () -> Unit,
    onRegister: () -> Unit,
) {
    val isRegistering = phase.mode == AuthMode.Register
    Text(
        text = stringResource(if (isRegistering) Res.string.auth_register_title else Res.string.auth_sign_in_title),
        variant = TextVariant.H2,
    )
    Text(
        text =
            stringResource(
                if (isRegistering) Res.string.auth_register_description else Res.string.auth_sign_in_description,
                phase.instance.name,
            ),
        variant = TextVariant.P,
    )
    if (isRegistering) {
        Input(
            value = phase.form.username,
            onValueChange = onUsernameChange,
            label = stringResource(Res.string.auth_username),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Next),
            enabled = !phase.isSubmitting,
        )
        Input(
            value = phase.form.email,
            onValueChange = onEmailChange,
            label = stringResource(Res.string.auth_email),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            enabled = !phase.isSubmitting,
        )
        Input(
            value = phase.form.displayName,
            onValueChange = onDisplayNameChange,
            label = stringResource(Res.string.auth_display_name),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            enabled = !phase.isSubmitting,
            maxLength = 60,
            showCharCount = true,
        )
    } else {
        Input(
            value = phase.form.identifier,
            onValueChange = onIdentifierChange,
            label = stringResource(Res.string.auth_username_or_email),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            enabled = !phase.isSubmitting,
        )
    }
    Input(
        value = phase.form.password,
        onValueChange = onPasswordChange,
        label = stringResource(Res.string.auth_password),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = if (isRegistering) ImeAction.Next else ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onSignIn() }),
        visualTransformation = PasswordVisualTransformation(),
        enabled = !phase.isSubmitting,
    )
    if (isRegistering) {
        Input(
            value = phase.form.confirmation,
            onValueChange = onConfirmationChange,
            label = stringResource(Res.string.auth_password_confirmation),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onRegister() }),
            visualTransformation = PasswordVisualTransformation(),
            enabled = !phase.isSubmitting,
        )
    }
    phase.error?.let { FormError(it) }
    Button(
        text = stringResource(if (isRegistering) Res.string.auth_register else Res.string.auth_sign_in),
        onClick = if (isRegistering) onRegister else onSignIn,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
        loading = phase.isSubmitting,
    )
    Button(
        text = stringResource(if (isRegistering) Res.string.auth_change_to_sign_in else Res.string.auth_change_to_register),
        onClick = if (isRegistering) onShowSignIn else onShowRegistration,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
        variant = ButtonVariant.Outline,
        enabled = !phase.isSubmitting,
    )
}

@Composable
private fun FormError(error: AuthFormError) {
    val message =
        when (error) {
            AuthFormError.IdentifierRequired -> Res.string.auth_error_identifier_required
            AuthFormError.InvalidUsername -> Res.string.auth_error_invalid_username
            AuthFormError.InvalidEmail -> Res.string.auth_error_invalid_email
            AuthFormError.PasswordTooShort -> Res.string.auth_error_password_too_short
            AuthFormError.PasswordTooLong -> Res.string.auth_error_password_too_long
            AuthFormError.PasswordsDoNotMatch -> Res.string.auth_error_passwords_do_not_match
            AuthFormError.DisplayNameTooLong -> Res.string.auth_error_display_name_too_long
            AuthFormError.EmailAlreadyRegistered -> Res.string.auth_error_email_already_registered
            AuthFormError.Unavailable -> Res.string.auth_error_request_failed
        }
    Text(text = stringResource(message), variant = TextVariant.Small, color = RikkaTheme.colors.destructive)
}

@Composable
private fun SignedIn(
    phase: AuthPhase.SignedIn,
    onSignOut: () -> Unit,
    onChangeInstance: () -> Unit,
) {
    Text(text = stringResource(Res.string.auth_signed_in_title), variant = TextVariant.H2)
    Text(
        text = stringResource(Res.string.auth_signed_in_description, phase.user.displayName, phase.instance.name),
        variant = TextVariant.P,
    )
    phase.error?.let { FormError(AuthFormError.Unavailable) }
    Button(
        text = stringResource(Res.string.auth_sign_out),
        onClick = onSignOut,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
        loading = phase.isSigningOut,
    )
    ChangeInstanceButton(onChangeInstance)
}

@Composable
private fun VerificationRequired(
    phase: AuthPhase.VerificationRequired,
    onShowSignIn: () -> Unit,
    onChangeInstance: () -> Unit,
) {
    Text(text = stringResource(Res.string.auth_verification_title), variant = TextVariant.H2)
    Text(
        text =
            phase.email?.let { stringResource(Res.string.auth_verification_description, it) }
                ?: stringResource(Res.string.auth_verification_description_without_email, phase.instance.name),
        variant = TextVariant.P,
    )
    Button(
        text = stringResource(Res.string.auth_change_to_sign_in),
        onClick = onShowSignIn,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
    )
    ChangeInstanceButton(onChangeInstance)
}

@Composable
private fun AuthError(
    error: AuthError,
    onRetry: () -> Unit,
    onChangeInstance: () -> Unit,
) {
    Text(
        text =
            stringResource(
                if (error == AuthError.MissingInstance) {
                    Res.string.auth_error_missing_instance
                } else {
                    Res.string.auth_error_unavailable
                },
            ),
        variant = TextVariant.H2,
    )
    Button(
        text = stringResource(Res.string.auth_try_again),
        onClick = onRetry,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
    )
    ChangeInstanceButton(onChangeInstance)
}

@Composable
private fun ChangeInstanceButton(onClick: () -> Unit) {
    Button(
        text = stringResource(Res.string.connect_change_instance),
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        size = ButtonSize.Lg,
        variant = ButtonVariant.Outline,
    )
}
