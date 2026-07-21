import { confirm, useAlertStore, useToastStore } from '@overworld-engine/notifications'
import { AlertHost, Button, ToastViewport } from '@overworld-engine/ui'

export default { title: 'Engines / Notifications' }

export const ToastsAndAlerts = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <Button
      onClick={() =>
        useToastStore.getState().show({ message: 'Item acquired!', variant: 'success', icon: '✨' })
      }
    >
      Toast
    </Button>
    <Button onClick={() => useToastStore.getState().show({ message: 'Low health!', variant: 'error' })}>
      Error toast
    </Button>
    <Button onClick={() => void confirm({ title: 'Leave area?', message: 'Progress will be saved.' })}>
      Confirm
    </Button>
    <ToastViewport store={useToastStore} />
    <AlertHost store={useAlertStore} />
  </div>
)
