import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, Key, Loader2, Rocket, Settings, Wifi } from 'lucide-react'
import { api } from '../utils/api'
import { UiBuildFooter } from '../UiBuildFooter'

const ONBOARDING_STEPS = [
  { id: 'welcome', title: 'Welcome', icon: Rocket },
  { id: 'apiKeys', title: 'API Keys', icon: Key },
  { id: 'connection', title: 'Connection', icon: Wifi },
  { id: 'firstAgent', title: 'First Agent', icon: Settings },
]

export function OnboardingPage({ me, onComplete }) {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState('welcome')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState(null) // 'success' | 'error' | null
  const [savingKeys, setSavingKeys] = useState(false)
  const [agentName, setAgentName] = useState('')
  const [creatingAgent, setCreatingAgent] = useState(false)

  // Check if user already has API keys configured
  useEffect(() => {
    if (me?.has_anthropic_key) {
      // User already has Anthropic key, skip to dashboard
      navigate('/app/home')
    }
  }, [me, navigate])

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setConnectionStatus(null)
    
    try {
      // Test Anthropic connection if key is provided
      if (anthropicKey.trim()) {
        const response = await api('/api/onboarding/test-anthropic', {
          method: 'POST',
          body: JSON.stringify({ api_key: anthropicKey.trim() }),
        })
        if (response.valid) {
          setConnectionStatus('success')
        } else {
          setConnectionStatus('error')
        }
      } else {
        // No key provided
        setConnectionStatus('error')
      }
    } catch (error) {
      setConnectionStatus('error')
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSaveKeys = async () => {
    setSavingKeys(true)
    try {
      await api('/api/account/api-keys', {
        method: 'PUT',
        body: JSON.stringify({
          anthropic_api_key: anthropicKey.trim() || null,
          openai_api_key: openaiKey.trim() || null,
        }),
      })
      // Update user state to reflect that keys are saved
      onComplete()
      setCurrentStep('connection')
    } catch (error) {
      console.error('Failed to save API keys:', error)
    } finally {
      setSavingKeys(false)
    }
  }

  const handleCreateFirstAgent = async () => {
    setCreatingAgent(true)
    try {
      // Create a simple default agent
      const response = await api('/api/my/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: agentName || 'My First Agent',
          description: 'A helpful AI assistant',
          execution_mode: 'sequential',
          members: [
            {
              name: 'Assistant',
              job_title: 'AI Assistant',
              capability: 'general',
              bot_name: 'Assistant',
              prompt: 'You are a helpful AI assistant that can help with various tasks.',
              max_tokens: 256,
              provider: 'anthropic',
              model: 'claude-3-5-haiku-latest',
            }
          ],
          tasks: JSON.stringify([
            { id: '1', title: 'Get started', description: 'Introduce yourself and get ready to help', assignee: 'Assistant' }
          ]),
        }),
      })

      // Navigate to the new agent
      navigate(`/app/agents`)
    } catch (error) {
      console.error('Failed to create agent:', error)
    } finally {
      setCreatingAgent(false)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Rocket className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Welcome to AgentHotel</h2>
              <p className="text-muted-foreground mt-2">
                Let's set up your AI agents in just a few steps
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-card rounded-lg border">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary">1</span>
                </div>
                <div>
                  <h3 className="font-medium">Connect your AI provider</h3>
                  <p className="text-sm text-muted-foreground">Add your Anthropic or OpenAI API key</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-card rounded-lg border">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary">2</span>
                </div>
                <div>
                  <h3 className="font-medium">Create your first agent</h3>
                  <p className="text-sm text-muted-foreground">Set up a simple AI assistant</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-card rounded-lg border">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary">3</span>
                </div>
                <div>
                  <h3 className="font-medium">See it work in the hotel</h3>
                  <p className="text-sm text-muted-foreground">Watch your agent come to life as a bot</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setCurrentStep('apiKeys')}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Get Started
            </button>
          </div>
        )

      case 'apiKeys':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Key className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Connect AI Provider</h2>
              <p className="text-muted-foreground mt-2">
                Add at least one API key to power your agents
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Anthropic API Key (Claude)
                </label>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Get your key from{' '}
                  <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Anthropic Console
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  OpenAI API Key (Optional - Voice transcription only)
                </label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Get your key from{' '}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    OpenAI Platform
                  </a>
                </p>
              </div>

              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-sm">
                  <span className="font-medium">Note:</span> You only need one provider. 
                  Claude is recommended for better performance with this platform.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep('welcome')}
                className="flex-1 py-3 border rounded-lg font-medium hover:bg-secondary transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSaveKeys}
                disabled={(!anthropicKey.trim() && !openaiKey.trim()) || savingKeys}
                className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingKeys ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'Save & Continue'
                )}
              </button>
            </div>
          </div>
        )

      case 'connection':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wifi className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Test Connection</h2>
              <p className="text-muted-foreground mt-2">
                Let's make sure everything is working
              </p>
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-card rounded-lg border text-center">
                {connectionStatus === 'success' ? (
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle className="w-6 h-6 text-success" />
                    </div>
                    <h3 className="font-medium text-success">Connection Successful!</h3>
                    <p className="text-sm text-muted-foreground">
                      Your API key is valid and ready to use
                    </p>
                  </div>
                ) : connectionStatus === 'error' ? (
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                      <div className="w-6 h-6 rounded-full bg-destructive flex items-center justify-center">
                        <span className="text-white text-sm">!</span>
                      </div>
                    </div>
                    <h3 className="font-medium text-destructive">Connection Failed</h3>
                    <p className="text-sm text-muted-foreground">
                      Please check your API key and try again
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto">
                      <Wifi className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-medium">Ready to Test</h3>
                    <p className="text-sm text-muted-foreground">
                      Click below to test your connection
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection || (!anthropicKey.trim() && !openaiKey.trim())}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingConnection ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    'Test Connection'
                  )}
                </button>

                {connectionStatus === 'success' && (
                  <button
                    onClick={() => setCurrentStep('firstAgent')}
                    className="w-full py-3 border border-primary text-primary rounded-lg font-medium hover:bg-primary/10 transition-colors"
                  >
                    Continue to Next Step
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep('apiKeys')}
                className="flex-1 py-3 border rounded-lg font-medium hover:bg-secondary transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => navigate('/app/home')}
                className="flex-1 py-3 border rounded-lg font-medium hover:bg-secondary transition-colors"
              >
                Skip to Dashboard
              </button>
            </div>
          </div>
        )

      case 'firstAgent':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Create First Agent</h2>
              <p className="text-muted-foreground mt-2">
                Set up your first AI assistant
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="My Assistant"
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                />
              </div>

              <div className="bg-card p-4 rounded-lg border space-y-3">
                <h3 className="font-medium">Default Agent Configuration</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provider:</span>
                    <span>Claude (Anthropic)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model:</span>
                    <span>claude-3-5-haiku-latest</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capability:</span>
                    <span>General Assistant</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  You can customize this later in the agent settings
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleCreateFirstAgent}
                disabled={creatingAgent}
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingAgent ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'Create Agent'
                )}
              </button>

              <button
                onClick={() => navigate('/app/home')}
                className="w-full py-3 border rounded-lg font-medium hover:bg-secondary transition-colors"
              >
                Skip to Dashboard
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep('connection')}
                className="flex-1 py-3 border rounded-lg font-medium hover:bg-secondary transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const currentStepIndex = ONBOARDING_STEPS.findIndex(step => step.id === currentStep)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              {ONBOARDING_STEPS.map((step, index) => {
                const isActive = step.id === currentStep
                const isCompleted = index < currentStepIndex
                return (
                  <div key={step.id} className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : isCompleted
                          ? 'bg-success text-success-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <step.icon className="w-4 h-4" />
                      )}
                    </div>
                    <span className={`text-xs mt-1 ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      {step.title}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(currentStepIndex / (ONBOARDING_STEPS.length - 1)) * 100}%` }}
              />
            </div>
          </div>

          {/* Step content */}
          <div className="bg-card border rounded-xl p-6 shadow-sm">
            {renderStep()}
          </div>
        </div>
      </div>

      <UiBuildFooter />
    </div>
  )
}