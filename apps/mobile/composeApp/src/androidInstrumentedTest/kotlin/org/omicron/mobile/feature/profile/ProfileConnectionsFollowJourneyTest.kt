package org.omicron.mobile.feature.profile

import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import java.util.Collections
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.io.IOException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.data.api.FollowCountsDto
import org.omicron.mobile.data.api.KtorSocialApi
import org.omicron.mobile.data.api.LocalProfileDto
import org.omicron.mobile.data.api.LocalProfileUserDto
import org.omicron.mobile.data.api.RelationActorDto
import org.omicron.mobile.data.api.RelationActorsDto
import org.omicron.mobile.data.api.RemoteProfileDto
import org.omicron.mobile.data.api.RemoteProfileUserDto
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.InstanceConfiguration

@RunWith(AndroidJUnit4::class)
class ProfileConnectionsFollowJourneyTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val followState = AtomicReference("none")
    private val mutations = AtomicInteger()
    private val checks = AtomicInteger()
    private val failMutation = AtomicBoolean()
    private val failCheck = AtomicBoolean()
    private val mutationPaths = Collections.synchronizedList(mutableListOf<String>())
    private var signInRequested = false
    private var client: HttpClient? = null
    private var viewModel: ProfileConnectionsViewModel? = null

    @After
    fun close() {
        viewModel?.close()
        client?.close()
    }

    @Test
    fun followIsImmediateButUnfollowRequiresASecondActionAndCancelOrBackKeepsTheFollow() {
        show()
        waitForAction("Follow @grace")
        rule.onNodeWithContentDescription("Follow @grace").performClick()
        waitForAction("Following @grace")
        rule.waitUntil(5_000) { mutations.get() == 1 }

        rule.onNodeWithContentDescription("Following @grace").performClick()
        rule.onNodeWithText("Unfollow @grace?").assertIsDisplayed()
        assertEquals(1, mutations.get())
        rule.onNodeWithText("Cancel").performClick()
        rule.onNodeWithContentDescription("Following @grace").assertIsDisplayed()
        assertEquals(1, mutations.get())

        rule.onNodeWithContentDescription("Following @grace").performClick()
        rule.onNodeWithText("Unfollow @grace?").assertIsDisplayed()
        rule.waitUntil(5_000) { !rule.activity.hasWindowFocus() }
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        rule.onNodeWithText("Unfollow @grace?").assertDoesNotExist()
        assertEquals(1, mutations.get())

        rule.onNodeWithContentDescription("Following @grace").performClick()
        rule.onNodeWithText("Unfollow").performClick()
        waitForAction("Follow @grace")
        rule.waitUntil(5_000) { mutations.get() == 2 }
        assertEquals("none", followState.get())
    }

    @Test
    fun failedUnfollowRollsBackAndSuccessfulRetryUpdatesOwnFollowingListAndCount() {
        followState.set("following")
        failMutation.set(true)
        show(tab = ProfileConnectionsTab.Following, dark = false)
        waitForAction("Following @grace")
        rule.onNodeWithText("1 following").assertIsSelected()
        rule.onNodeWithContentDescription("Following @grace").performClick()
        rule.onNodeWithText("Unfollow").performClick()
        waitForText("You appear to be offline. Try again.")
        rule.onNodeWithContentDescription("Following @grace").assertIsDisplayed()
        rule.onNodeWithText("1 following").assertIsSelected()

        rule.onNodeWithContentDescription("Following @grace").performClick()
        rule.onNodeWithText("Unfollow").performClick()
        waitForText("Not following anyone yet.")
        rule.onNodeWithText("0 following").assertIsSelected()
        assertEquals(2, mutations.get())
    }

    @Test
    fun privateFollowRequestsNeedConfirmationBeforeCancellation() {
        show(privateAccount = true)
        waitForAction("Follow @grace")
        rule.onNodeWithContentDescription("Follow @grace").performClick()
        waitForAction("Requested @grace")
        rule.waitUntil(5_000) { mutations.get() == 1 }
        rule.onNodeWithContentDescription("Requested @grace").performClick()
        rule.onNodeWithText("Cancel follow request to @grace?").assertIsDisplayed()
        assertEquals(1, mutations.get())
        rule.onNodeWithText("Cancel").performClick()
        rule.onNodeWithContentDescription("Requested @grace").performClick()
        rule.onNodeWithText("Cancel request").performClick()
        waitForAction("Follow @grace")
        rule.waitUntil(5_000) { mutations.get() == 2 }
        assertEquals("none", followState.get())
    }

    @Test
    fun failedRelationshipCheckOffersRetryBeforeAnyMutation() {
        failCheck.set(true)
        show()
        waitForAction("Try again @grace")
        rule.onNodeWithText("You appear to be offline. Try again.").assertIsDisplayed()
        assertEquals(0, mutations.get())
        rule.onNodeWithContentDescription("Try again @grace").performClick()
        waitForAction("Follow @grace")
        assertEquals(2, checks.get())
        assertEquals(0, mutations.get())
    }

    @Test
    fun guestFollowOpensSignInWithoutCheckingOrMutatingTheRelationship() {
        show(guest = true)
        waitForAction("Follow @grace")
        rule.onNodeWithContentDescription("Follow @grace").performClick()
        assertTrue(signInRequested)
        assertEquals(0, checks.get())
        assertEquals(0, mutations.get())
    }

    @Test
    fun ownRowHasNoFollowControl() {
        show(includeSelf = true)
        waitForAction("Follow @grace")
        rule.onNodeWithText("@ada").assertIsDisplayed()
        rule.onNodeWithContentDescription("Follow @ada").assertDoesNotExist()
        rule.onNodeWithContentDescription("Checking @ada").assertDoesNotExist()
        assertEquals(1, checks.get())
    }

    @Test
    fun remoteRowsUseFederatedFollowAndUnfollowRoutes() {
        show(remote = true)
        waitForAction("Follow @grace@writers.example")
        rule.onNodeWithContentDescription("Follow @grace@writers.example").performClick()
        waitForAction("Following @grace@writers.example")
        rule.waitUntil(5_000) { mutations.get() == 1 }
        rule.onNodeWithContentDescription("Following @grace@writers.example").performClick()
        rule.onNodeWithText("Unfollow").performClick()
        waitForAction("Follow @grace@writers.example")
        rule.waitUntil(5_000) { mutations.get() == 2 }
        assertTrue(mutationPaths.all { it.startsWith("/api/remote/users/") && it.endsWith("/follow") })
    }

    @Test
    fun largeTextOnANarrowScreenKeepsTheActionAndConfirmationUsable() {
        followState.set("following")
        show(width = 320, fontScale = 1.5f)
        waitForAction("Following @grace")
        val action = rule.onNodeWithContentDescription("Following @grace")
        action.assertHeightIsAtLeast(48.dp)
        val bounds = action.fetchSemanticsNode().boundsInRoot
        assertTrue(bounds.left >= 0 && bounds.right <= rule.density.run { 320.dp.toPx() })
        action.performClick()
        rule.onNodeWithText("Unfollow @grace?").assertIsDisplayed()
        rule.onNodeWithText("Cancel").assertHeightIsAtLeast(48.dp).performClick()
        assertEquals(0, mutations.get())
    }

    private fun waitForAction(description: String) {
        rule.waitUntil(5_000) { rule.onAllNodesWithContentDescription(description).fetchSemanticsNodes().isNotEmpty() }
        rule.waitUntil(5_000) { viewModel?.uiState?.value?.memberFollows?.values?.none { it.busy || it.loading } != false }
        rule.onNodeWithContentDescription(description).assertIsDisplayed()
    }

    private fun waitForText(text: String) {
        rule.waitUntil(5_000) { rule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText(text).assertIsDisplayed()
    }

    private fun show(
        tab: ProfileConnectionsTab = ProfileConnectionsTab.Followers,
        guest: Boolean = false,
        privateAccount: Boolean = false,
        remote: Boolean = false,
        includeSelf: Boolean = false,
        dark: Boolean = true,
        width: Int = 360,
        fontScale: Float = 1f,
    ) {
        val sessions = MutableStateFlow<AuthenticatedSession?>(if (guest) null else AuthenticatedSession(AuthenticatedUser("viewer", "ada@example.com", "ada", "Ada"), "signed-token"))
        val json = Json { ignoreUnknownKeys = true }
        val username = if (remote) "grace@writers.example" else "grace"
        val actor = RelationActorDto("grace", username, "Grace Hopper", remote = remote)
        val engine = MockEngine { request ->
            val path = request.url.encodedPath
            val response = when {
                path.endsWith("/follow") -> {
                    assertEquals("Bearer signed-token", request.headers[HttpHeaders.Authorization])
                    mutations.incrementAndGet()
                    mutationPaths += path
                    if (failMutation.getAndSet(false)) throw IOException("offline")
                    val next = if (request.method == HttpMethod.Delete) "none" else if (privateAccount) "requested" else "following"
                    followState.set(next)
                    if (remote) "{\"ok\":true}" else "{\"ok\":true,\"state\":\"$next\"}"
                }
                path == "/api/users/ada/followers" || path == "/api/users/ada/following" -> {
                    val members = if (path.endsWith("/following") && followState.get() != "following") emptyList() else listOf(actor)
                    json.encodeToString(RelationActorsDto(if (includeSelf) listOf(RelationActorDto("viewer", "ada", "Ada")) + members else members))
                }
                path == "/api/users/ada" -> json.encodeToString(LocalProfileDto(LocalProfileUserDto("viewer", "ada", "Ada"), FollowCountsDto(1, if (followState.get() == "following") 1 else 0)))
                path == "/api/users/grace" || path.startsWith("/api/remote/users/") -> {
                    checks.incrementAndGet()
                    if (failCheck.getAndSet(false)) throw IOException("offline")
                    if (remote) json.encodeToString(RemoteProfileDto(RemoteProfileUserDto("grace", username, "Grace Hopper", host = "writers.example", apId = "https://writers.example/@grace"), FollowCountsDto(), isFollowing = followState.get() == "following"))
                    else json.encodeToString(LocalProfileDto(LocalProfileUserDto("grace", "grace", "Grace Hopper", isPrivate = privateAccount), FollowCountsDto(), followState = followState.get(), isFollowing = followState.get() == "following"))
                }
                else -> error("Unexpected API request: $path")
            }
            respond(response, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val httpClient = HttpClient(engine) {
            expectSuccess = true
            install(ContentNegotiation) { json(json) }
        }
        client = httpClient
        val model = ProfileConnectionsViewModel(
            SocialRepository(KtorSocialApi(httpClient), savedInstance = { InstanceConfiguration("https://omicron.blog", "Omicron", "omicron.blog", true, true, true, true) }, accessToken = { sessions.value?.accessToken }),
            "ada",
            tab,
            session = sessions,
        )
        viewModel = model
        rule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                OmicronTheme(darkTheme = dark) {
                    Box(Modifier.width(width.dp)) {
                        ProfileConnectionsRoute(model, onBack = {}, onSignIn = { signInRequested = true }, onOpenProfile = {})
                    }
                }
            }
        }
    }
}
