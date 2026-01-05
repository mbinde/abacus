export default function LoadingSkeleton() {
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      {/* Skeleton filter bar */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="skeleton" style={{ height: '32px', width: i === 6 ? '60px' : '80px' }} />
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <div className="skeleton" style={{ height: '32px', width: '200px' }} />
        </div>
      </div>

      {/* Skeleton table */}
      <table>
        <thead>
          <tr>
            <th style={{ width: '40px' }}><div className="skeleton" style={{ width: '16px', height: '16px' }} /></th>
            <th style={{ width: '40px' }}><div className="skeleton" style={{ width: '16px', height: '16px' }} /></th>
            <th><div className="skeleton skeleton-text-short" /></th>
            <th><div className="skeleton skeleton-text-short" /></th>
            <th><div className="skeleton" style={{ width: '50px', height: '1rem' }} /></th>
            <th><div className="skeleton" style={{ width: '60px', height: '1rem' }} /></th>
            <th><div className="skeleton" style={{ width: '60px', height: '1rem' }} /></th>
            <th><div className="skeleton" style={{ width: '60px', height: '1rem' }} /></th>
            <th><div className="skeleton" style={{ width: '80px', height: '1rem' }} /></th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5].map(i => (
            <SkeletonRow key={i} delay={i * 100} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SkeletonRow({ delay }: { delay: number }) {
  return (
    <tr style={{ animationDelay: `${delay}ms` }}>
      <td><div className="skeleton" style={{ width: '16px', height: '16px' }} /></td>
      <td><div className="skeleton" style={{ width: '20px', height: '20px' }} /></td>
      <td><div className="skeleton" style={{ width: '90px', height: '1rem' }} /></td>
      <td>
        <div className="skeleton" style={{ width: `${150 + Math.random() * 100}px`, height: '1rem' }} />
      </td>
      <td><div className="skeleton skeleton-badge" /></td>
      <td><div className="skeleton skeleton-badge" /></td>
      <td><div className="skeleton" style={{ width: '60px', height: '1rem' }} /></td>
      <td><div className="skeleton" style={{ width: '50px', height: '1rem' }} /></td>
      <td>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <div className="skeleton" style={{ width: '40px', height: '28px' }} />
          <div className="skeleton" style={{ width: '50px', height: '28px' }} />
        </div>
      </td>
    </tr>
  )
}
