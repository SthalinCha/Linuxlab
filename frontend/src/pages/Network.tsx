import PortForwardGrid from '../components/PortForwardGrid'
import ContentHeader from '../components/ContentHeader'

export default function Network() {
  return (
    <div className="space-y-4">
      <ContentHeader title="Accesos" icon="fa-network-wired" />
      <PortForwardGrid />
    </div>
  )
}
