package org.omicron.mobile.feature.auth

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.buildJsonObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.storage.InstanceStore
import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.data.api.AuthSessionCreationDto
import org.omicron.mobile.data.api.AuthSessionDto
import org.omicron.mobile.data.api.AuthTokenDto
import org.omicron.mobile.data.api.AuthUserDto
import org.omicron.mobile.data.api.InstanceApi
import org.omicron.mobile.data.api.InstanceInfoDto
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.data.repository.InstanceRepository
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.feature.connect.ConnectPhase
import org.omicron.mobile.feature.connect.ConnectRoute
import org.omicron.mobile.feature.connect.ConnectViewModel

@RunWith(AndroidJUnit4::class)
class R1JourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun firstConnectionNormalizesAndPersistsTheInstance() {
        val store = FakeInstanceStore()
        var continued = false
        val viewModel = connectViewModel(FakeInstanceApi(), store)

        composeTestRule.setContent {
            OmicronTheme {
                ConnectRoute(viewModel = viewModel, onContinue = { continued = true })
            }
        }
        composeTestRule.waitForText("Choose an instance")

        composeTestRule.onNodeWithContentDescription("Instance address").performTextReplacement("omicron.blog/")
        composeTestRule.onNodeWithContentDescription("Continue").performClick()
        composeTestRule.waitForText("Connected to Omicron")
        composeTestRule.onNodeWithContentDescription("Continue").performClick()

        check(store.configuration?.origin == "https://omicron.blog")
        check(continued)
        viewModel.close()
    }

    @Test
    fun invalidOriginShowsAnErrorWithoutMakingARequest() {
        val api = FakeInstanceApi()
        val viewModel = connectViewModel(api, FakeInstanceStore())

        composeTestRule.setContent {
            OmicronTheme {
                ConnectRoute(viewModel = viewModel, onContinue = {})
            }
        }
        composeTestRule.waitForText("Choose an instance")

        composeTestRule.onNodeWithContentDescription("Instance address").performTextReplacement("http://omicron.blog")
        composeTestRule.onNodeWithContentDescription("Continue").performClick()

        composeTestRule.waitForText("Enter a valid HTTPS instance address.")
        check(api.requestCount == 0)
        viewModel.close()
    }

    @Test
    fun offlineConnectionCanBeRetried() {
        val api = FakeInstanceApi(failuresRemaining = 1)
        val viewModel = connectViewModel(api, FakeInstanceStore())

        composeTestRule.setContent {
            OmicronTheme {
                ConnectRoute(viewModel = viewModel, onContinue = {})
            }
        }
        composeTestRule.waitForText("Choose an instance")

        composeTestRule.onNodeWithContentDescription("Continue").performClick()
        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            viewModel.uiState.value.phase is ConnectPhase.Error
        }
        composeTestRule.onNodeWithContentDescription("Try again").performClick()
        composeTestRule.waitForText("Connected to Omicron")

        check(api.requestCount == 2)
        viewModel.close()
    }

    @Test
    fun signInSubmitsUsernameCredentialsAndShowsTheSession() {
        val api = FakeAuthApi()
        val viewModel = AuthViewModel(savedInstance = ::instance, repository = AuthRepository(api))

        composeTestRule.setContent {
            OmicronTheme {
                AuthRoute(viewModel = viewModel, onChangeInstance = {})
            }
        }
        composeTestRule.waitForText("Welcome back")

        composeTestRule.onNodeWithContentDescription("Username or email").performTextInput("ada")
        composeTestRule.onNodeWithContentDescription("Password").performTextInput("Unique-test-password-123!")
        composeTestRule.onNodeWithContentDescription("Sign in").performClick()
        composeTestRule.waitForText("Session restored")

        check(api.usernameSignIn == "ada")
        viewModel.close()
    }

    @Test
    fun sessionRestorationShowsTheSavedAccount() {
        val viewModel = AuthViewModel(savedInstance = ::instance, repository = AuthRepository(FakeAuthApi(session())))

        composeTestRule.setContent {
            OmicronTheme {
                AuthRoute(viewModel = viewModel, onChangeInstance = {})
            }
        }

        composeTestRule.waitForText("Session restored")
        composeTestRule.waitForText("Signed in as Ada on Omicron.")
        viewModel.close()
    }

    @Test
    fun signOutReturnsToCredentials() {
        val api = FakeAuthApi(session())
        val viewModel = AuthViewModel(savedInstance = ::instance, repository = AuthRepository(api))

        composeTestRule.setContent {
            OmicronTheme {
                AuthRoute(viewModel = viewModel, onChangeInstance = {})
            }
        }
        composeTestRule.waitForText("Session restored")

        composeTestRule.onNodeWithContentDescription("Sign out").performClick()
        composeTestRule.waitForText("Welcome back")

        check(api.signOutCount == 1)
        viewModel.close()
    }

}

private fun ComposeTestRule.waitForText(text: String) {
    waitUntil(timeoutMillis = 5_000) {
        onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty()
    }
}

private fun connectViewModel(
    api: InstanceApi,
    store: InstanceStore,
) = ConnectViewModel(
    repository = InstanceRepository(api, store),
    scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
)

private class FakeInstanceStore : InstanceStore {
    var configuration: InstanceConfiguration? = null

    override suspend fun read(): InstanceConfiguration? = configuration

    override suspend fun write(configuration: InstanceConfiguration) {
        this.configuration = configuration
    }
}

private class FakeInstanceApi(
    private var failuresRemaining: Int = 0,
) : InstanceApi {
    var requestCount = 0

    override suspend fun getInstance(origin: String): InstanceInfoDto {
        requestCount += 1
        if (failuresRemaining > 0) {
            failuresRemaining -= 1
            error("Offline")
        }
        return InstanceInfoDto(
            name = "Omicron",
            domain = "omicron.blog",
            federationEnabled = true,
            setupComplete = true,
            emailEnabled = true,
            emailVerificationRequired = true,
        )
    }
}

private class FakeAuthApi(
    private var session: AuthSessionDto? = null,
) : AuthApi {
    var signOutCount = 0
    var usernameSignIn: String? = null

    override suspend fun getSession(origin: String): AuthSessionDto? = session

    override suspend fun getToken(origin: String): AuthTokenDto = AuthTokenDto("signed-token")

    override suspend fun signInEmail(origin: String, email: String, password: String): AuthSessionCreationDto {
        session = session()
        return creation()
    }

    override suspend fun signInUsername(origin: String, username: String, password: String): AuthSessionCreationDto {
        usernameSignIn = username
        session = session()
        return creation()
    }

    override suspend fun signUpEmail(
        origin: String,
        email: String,
        password: String,
        username: String,
        displayName: String,
    ): AuthSessionCreationDto = creation()

    override suspend fun signOut(origin: String) {
        signOutCount += 1
        session = null
    }
}

private fun instance() =
    InstanceConfiguration(
        origin = "https://omicron.blog",
        name = "Omicron",
        domain = "omicron.blog",
        federationEnabled = true,
        setupComplete = true,
        emailEnabled = true,
        emailVerificationRequired = true,
    )

private fun session() =
    AuthSessionDto(
        user = AuthUserDto(id = "user-1", email = "ada@example.com", username = "ada", displayName = "Ada"),
        session = buildJsonObject {},
    )

private fun creation() = AuthSessionCreationDto(user = session().user, token = "session-token")
