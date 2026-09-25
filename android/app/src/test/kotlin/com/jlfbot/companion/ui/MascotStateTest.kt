package com.jlfbot.companion.ui

import com.jlfbot.companion.core.Chat
import com.jlfbot.companion.core.CompanionState
import com.jlfbot.companion.core.Message
import com.jlfbot.companion.core.OptionCard
import com.jlfbot.companion.core.ToolActivity
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Which face a bot wears, in the desktop's order: a pinned expression, then a
 * failure, then work, then unread, then a question, then its role. The order is
 * the point — it is what makes "this one stopped and needs you" louder than "this
 * one is busy", so each rung is tested against the one below it.
 *
 * Ported alongside `ios/App/MascotState.swift`; a divergence here is a bot wearing
 * one face on the laptop and another on the phone.
 */
class MascotStateTest {
    private val idle = bot(title = "", name = "Bot")

    @Test
    fun `a pinned expression wins over everything the bot is doing`() {
        val pinned = idle.copy(
            mascotExpression = "celebrate",
            busy = true,
            unread = true,
        )
        assertEquals(JlfState.CELEBRATE, JlfState.forBot(pinned, failedActivity))
    }

    @Test
    fun `the desktop's legacy expression names still resolve`() {
        assertEquals(JlfState.IDLE, JlfState.normalize("deadpan"))
        assertEquals(JlfState.HAPPY, JlfState.normalize("friendly"))
        assertEquals(JlfState.WORKING, JlfState.normalize("focused"))
        assertEquals(JlfState.THINKING, JlfState.normalize("thinking"))
        assertEquals(JlfState.EXCITED, JlfState.normalize("excited"))
        assertEquals(JlfState.DROWSY, JlfState.normalize("sleepy"))
        assertEquals(JlfState.SURPRISED, JlfState.normalize("surprised"))
        assertEquals(JlfState.SUSPICIOUS, JlfState.normalize("skeptical"))
        assertEquals(JlfState.SCARED, JlfState.normalize("worried"))
        assertEquals(JlfState.PLAYFUL, JlfState.normalize("mischievous"))
    }

    @Test
    fun `every current expression name resolves to itself`() {
        for (state in JlfState.entries) {
            assertEquals(state, JlfState.normalize(state.id), state.id)
        }
    }

    @Test
    fun `an unknown or missing expression is not a pin`() {
        assertNull(JlfState.normalize(null))
        assertNull(JlfState.normalize(""))
        assertNull(JlfState.normalize("smouldering"))
        // and so the bot falls through to the rest of the ladder
        assertEquals(
            JlfState.WORKING,
            JlfState.forBot(idle.copy(mascotExpression = "smouldering", busy = true), null),
        )
    }

    @Test
    fun `a failed tool beats being busy`() {
        val busy = idle.copy(busy = true, unread = true)
        assertEquals(JlfState.ALERTING, JlfState.forBot(busy, failedActivity))
    }

    @Test
    fun `an activity that did not fail is not an alert`() {
        val ok = message(Message.Kind.ACTIVITY, tool = ToolActivity(name = "grep", ok = true))
        val unknown = message(Message.Kind.ACTIVITY, tool = ToolActivity(name = "grep"))
        assertEquals(JlfState.IDLE, JlfState.forBot(idle, ok))
        assertEquals(JlfState.IDLE, JlfState.forBot(idle, unknown))
    }

    @Test
    fun `a failure only counts on an activity`() {
        val text = message(Message.Kind.TEXT, tool = ToolActivity(name = "grep", ok = false))
        assertEquals(JlfState.IDLE, JlfState.forBot(idle, text))
    }

    @Test
    fun `busy beats unread`() {
        assertEquals(JlfState.WORKING, JlfState.forBot(idle.copy(busy = true, unread = true), null))
    }

    @Test
    fun `unread beats a question waiting on you`() {
        assertEquals(JlfState.NOTIFYING, JlfState.forBot(idle.copy(unread = true), optionsCard))
    }

    @Test
    fun `a question waiting on you beats the bot's role`() {
        val researcher = bot(title = "research", name = "Bot")
        assertEquals(JlfState.SEARCHING, JlfState.forBot(researcher, null))
        assertEquals(JlfState.CURIOUS, JlfState.forBot(researcher, optionsCard))
    }

    @Test
    fun `the role is read from name, title and description alike`() {
        assertEquals(JlfState.WORKING, JlfState.forBot(idle.copy(name = "Debug"), null))
        assertEquals(JlfState.WORKING, JlfState.forBot(idle.copy(title = "engineer"), null))
        assertEquals(JlfState.WORKING, JlfState.forBot(idle.copy(description = "writes software"), null))
    }

    @Test
    fun `each role wears the desktop's face for it`() {
        assertEquals(JlfState.WORKING, roleFace("engineering"))
        assertEquals(JlfState.SEARCHING, roleFace("investigate"))
        assertEquals(JlfState.EXCITED, roleFace("campaign"))
        assertEquals(JlfState.DROWSY, roleFace("overnight"))
        assertEquals(JlfState.RADAR, roleFace("uptime"))
        assertEquals(JlfState.SUSPICIOUS, roleFace("qa"))
        assertEquals(JlfState.SCARED, roleFace("compliance"))
        assertEquals(JlfState.PLAYFUL, roleFace("illustration"))
        assertEquals(JlfState.HAPPY, roleFace("onboarding"))
    }

    @Test
    fun `the first matching role wins, in the desktop's order`() {
        // "security" is checked before "design", and "code" before either
        assertEquals(JlfState.SCARED, roleFace("security design"))
        assertEquals(JlfState.WORKING, roleFace("code security design"))
    }

    @Test
    fun `a role matches whole words only`() {
        assertEquals(JlfState.IDLE, roleFace("codebase"))
        assertEquals(JlfState.IDLE, roleFace("aqua"))
        assertEquals(JlfState.SUSPICIOUS, roleFace("runs qa, mostly"))
        assertEquals(JlfState.DROWSY, roleFace("long-running errands"))
    }

    @Test
    fun `a bot with nothing to go on is idle`() {
        assertEquals(JlfState.IDLE, JlfState.forBot(idle, null))
    }

    @Test
    fun `a room always looks happy`() {
        val state = CompanionState(rooms = listOf(room()))
        assertEquals(JlfState.HAPPY, JlfState.forChat(Chat.RoomChat(room()), state))
    }

    @Test
    fun `a chat is resolved from its last visible message`() {
        val waiting = idle.copy(id = "bot-1")
        val state = CompanionState(
            bots = listOf(waiting),
            messages = mapOf(waiting.threadId to listOf(message(Message.Kind.TEXT), optionsCard)),
        )
        assertEquals(JlfState.CURIOUS, JlfState.forChat(Chat.BotChat(waiting), state))
    }

    @Test
    fun `a chat with no transcript still resolves`() {
        val state = CompanionState(bots = listOf(idle))
        assertEquals(JlfState.IDLE, JlfState.forChat(Chat.BotChat(idle), state))
    }

    private fun roleFace(description: String): JlfState =
        JlfState.forBot(idle.copy(description = description), null)

    private val failedActivity = message(
        Message.Kind.ACTIVITY,
        tool = ToolActivity(name = "shell", ok = false),
    )

    private val optionsCard = message(
        Message.Kind.OPTIONS,
        card = OptionCard(title = "Deploy?", subtitle = "", options = listOf("Yes"), requestId = "r1"),
    )

    private fun message(
        kind: Message.Kind,
        tool: ToolActivity? = null,
        card: OptionCard? = null,
    ) = Message(
        id = "m-${kind.name}-${tool?.ok}",
        role = Message.Role.BOT,
        kind = kind,
        at = 0.0,
        tool = tool,
        card = card,
    )
}
