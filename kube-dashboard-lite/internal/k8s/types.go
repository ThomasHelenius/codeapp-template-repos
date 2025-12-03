package k8s

import "time"

// ContextInfo represents a kubeconfig context
type ContextInfo struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	Namespace string `json:"namespace,omitempty"`
	IsCurrent bool   `json:"isCurrent"`
}

// NamespaceInfo represents a namespace
type NamespaceInfo struct {
	Name   string        `json:"name"`
	Status string        `json:"status"`
	Age    time.Duration `json:"age"`
}

// PodInfo represents basic pod information
type PodInfo struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Status    string            `json:"status"`
	Ready     string            `json:"ready"`
	Restarts  int32             `json:"restarts"`
	Age       time.Duration     `json:"age"`
	Node      string            `json:"node"`
	IP        string            `json:"ip"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// PodDetail represents detailed pod information
type PodDetail struct {
	PodInfo
	Containers []ContainerInfo `json:"containers"`
}

// ContainerInfo represents container information
type ContainerInfo struct {
	Name         string `json:"name"`
	Image        string `json:"image"`
	Ready        bool   `json:"ready"`
	RestartCount int32  `json:"restartCount"`
	State        string `json:"state"`
}

// DeploymentInfo represents deployment information
type DeploymentInfo struct {
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace"`
	Replicas        int32             `json:"replicas"`
	ReadyReplicas   int32             `json:"readyReplicas"`
	UpdatedReplicas int32             `json:"updatedReplicas"`
	Age             time.Duration     `json:"age"`
	Labels          map[string]string `json:"labels,omitempty"`
}

// ServiceInfo represents service information
type ServiceInfo struct {
	Name       string        `json:"name"`
	Namespace  string        `json:"namespace"`
	Type       string        `json:"type"`
	ClusterIP  string        `json:"clusterIP"`
	ExternalIP string        `json:"externalIP,omitempty"`
	Ports      []string      `json:"ports"`
	Age        time.Duration `json:"age"`
}

// EventInfo represents an event
type EventInfo struct {
	Type      string    `json:"type"`
	Reason    string    `json:"reason"`
	Message   string    `json:"message"`
	Object    string    `json:"object"`
	Count     int32     `json:"count"`
	FirstSeen time.Time `json:"firstSeen"`
	LastSeen  time.Time `json:"lastSeen"`
}

// ClusterInfo represents cluster information
type ClusterInfo struct {
	Context   string `json:"context"`
	Version   string `json:"version"`
	Platform  string `json:"platform"`
	NodeCount int    `json:"nodeCount"`
	GoVersion string `json:"goVersion"`
	BuildDate string `json:"buildDate"`
}

// LogOptions for log retrieval
type LogOptions struct {
	Follow       bool
	TailLines    int
	SinceSeconds int
}
