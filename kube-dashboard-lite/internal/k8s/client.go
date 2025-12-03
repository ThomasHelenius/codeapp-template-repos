package k8s

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// Client wraps the Kubernetes client with convenience methods
type Client struct {
	clientset     *kubernetes.Clientset
	config        *rest.Config
	currentContext string
	kubeconfig    string
}

// ClientOptions for creating a new client
type ClientOptions struct {
	Kubeconfig string
	Context    string
}

// NewClient creates a new Kubernetes client
func NewClient(opts ClientOptions) (*Client, error) {
	kubeconfig := opts.Kubeconfig
	if kubeconfig == "" {
		kubeconfig = defaultKubeconfig()
	}

	// Build config from kubeconfig
	loadingRules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: kubeconfig}
	configOverrides := &clientcmd.ConfigOverrides{}

	if opts.Context != "" {
		configOverrides.CurrentContext = opts.Context
	}

	kubeConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)

	config, err := kubeConfig.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to build config: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create clientset: %w", err)
	}

	rawConfig, err := kubeConfig.RawConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get raw config: %w", err)
	}

	return &Client{
		clientset:      clientset,
		config:         config,
		currentContext: rawConfig.CurrentContext,
		kubeconfig:     kubeconfig,
	}, nil
}

func defaultKubeconfig() string {
	if env := os.Getenv("KUBECONFIG"); env != "" {
		return env
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kube", "config")
}

// GetContexts returns available kubeconfig contexts
func (c *Client) GetContexts() ([]ContextInfo, error) {
	loadingRules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: c.kubeconfig}
	kubeConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, &clientcmd.ConfigOverrides{})

	rawConfig, err := kubeConfig.RawConfig()
	if err != nil {
		return nil, err
	}

	var contexts []ContextInfo
	for name, ctx := range rawConfig.Contexts {
		contexts = append(contexts, ContextInfo{
			Name:      name,
			Cluster:   ctx.Cluster,
			Namespace: ctx.Namespace,
			IsCurrent: name == rawConfig.CurrentContext,
		})
	}

	sort.Slice(contexts, func(i, j int) bool {
		return contexts[i].Name < contexts[j].Name
	})

	return contexts, nil
}

// SwitchContext switches to a different context
func (c *Client) SwitchContext(contextName string) error {
	newClient, err := NewClient(ClientOptions{
		Kubeconfig: c.kubeconfig,
		Context:    contextName,
	})
	if err != nil {
		return err
	}

	c.clientset = newClient.clientset
	c.config = newClient.config
	c.currentContext = contextName

	return nil
}

// CurrentContext returns the current context name
func (c *Client) CurrentContext() string {
	return c.currentContext
}

// GetNamespaces returns all namespaces
func (c *Client) GetNamespaces(ctx context.Context) ([]NamespaceInfo, error) {
	list, err := c.clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var namespaces []NamespaceInfo
	for _, ns := range list.Items {
		namespaces = append(namespaces, NamespaceInfo{
			Name:   ns.Name,
			Status: string(ns.Status.Phase),
			Age:    time.Since(ns.CreationTimestamp.Time),
		})
	}

	return namespaces, nil
}

// GetPods returns pods in a namespace
func (c *Client) GetPods(ctx context.Context, namespace string) ([]PodInfo, error) {
	list, err := c.clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var pods []PodInfo
	for _, pod := range list.Items {
		pods = append(pods, podToInfo(&pod))
	}

	return pods, nil
}

// GetPod returns a single pod
func (c *Client) GetPod(ctx context.Context, namespace, name string) (*PodDetail, error) {
	pod, err := c.clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	return podToDetail(pod), nil
}

// GetPodLogs returns logs for a pod
func (c *Client) GetPodLogs(ctx context.Context, namespace, name, container string, opts LogOptions) (io.ReadCloser, error) {
	podLogOpts := &corev1.PodLogOptions{
		Container: container,
		Follow:    opts.Follow,
	}

	if opts.TailLines > 0 {
		lines := int64(opts.TailLines)
		podLogOpts.TailLines = &lines
	}

	if opts.SinceSeconds > 0 {
		seconds := int64(opts.SinceSeconds)
		podLogOpts.SinceSeconds = &seconds
	}

	req := c.clientset.CoreV1().Pods(namespace).GetLogs(name, podLogOpts)
	return req.Stream(ctx)
}

// GetDeployments returns deployments in a namespace
func (c *Client) GetDeployments(ctx context.Context, namespace string) ([]DeploymentInfo, error) {
	list, err := c.clientset.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var deployments []DeploymentInfo
	for _, d := range list.Items {
		deployments = append(deployments, DeploymentInfo{
			Name:            d.Name,
			Namespace:       d.Namespace,
			Replicas:        *d.Spec.Replicas,
			ReadyReplicas:   d.Status.ReadyReplicas,
			UpdatedReplicas: d.Status.UpdatedReplicas,
			Age:             time.Since(d.CreationTimestamp.Time),
			Labels:          d.Labels,
		})
	}

	return deployments, nil
}

// GetServices returns services in a namespace
func (c *Client) GetServices(ctx context.Context, namespace string) ([]ServiceInfo, error) {
	list, err := c.clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var services []ServiceInfo
	for _, s := range list.Items {
		var ports []string
		for _, p := range s.Spec.Ports {
			ports = append(ports, fmt.Sprintf("%d/%s", p.Port, p.Protocol))
		}

		services = append(services, ServiceInfo{
			Name:       s.Name,
			Namespace:  s.Namespace,
			Type:       string(s.Spec.Type),
			ClusterIP:  s.Spec.ClusterIP,
			ExternalIP: getExternalIP(&s),
			Ports:      ports,
			Age:        time.Since(s.CreationTimestamp.Time),
		})
	}

	return services, nil
}

// GetEvents returns events in a namespace
func (c *Client) GetEvents(ctx context.Context, namespace string) ([]EventInfo, error) {
	list, err := c.clientset.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var events []EventInfo
	for _, e := range list.Items {
		events = append(events, EventInfo{
			Type:      e.Type,
			Reason:    e.Reason,
			Message:   e.Message,
			Object:    fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name),
			Count:     e.Count,
			FirstSeen: e.FirstTimestamp.Time,
			LastSeen:  e.LastTimestamp.Time,
		})
	}

	// Sort by last seen, most recent first
	sort.Slice(events, func(i, j int) bool {
		return events[i].LastSeen.After(events[j].LastSeen)
	})

	return events, nil
}

// RestartDeployment performs a rollout restart
func (c *Client) RestartDeployment(ctx context.Context, namespace, name string) error {
	deployment, err := c.clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}

	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = make(map[string]string)
	}
	deployment.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().Format(time.RFC3339)

	_, err = c.clientset.AppsV1().Deployments(namespace).Update(ctx, deployment, metav1.UpdateOptions{})
	return err
}

// GetClusterInfo returns basic cluster information
func (c *Client) GetClusterInfo(ctx context.Context) (*ClusterInfo, error) {
	version, err := c.clientset.Discovery().ServerVersion()
	if err != nil {
		return nil, err
	}

	nodes, err := c.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	return &ClusterInfo{
		Context:     c.currentContext,
		Version:     version.GitVersion,
		Platform:    version.Platform,
		NodeCount:   len(nodes.Items),
		GoVersion:   version.GoVersion,
		BuildDate:   version.BuildDate,
	}, nil
}

// Helper functions

func podToInfo(pod *corev1.Pod) PodInfo {
	var restarts int32
	var ready int
	for _, cs := range pod.Status.ContainerStatuses {
		restarts += cs.RestartCount
		if cs.Ready {
			ready++
		}
	}

	return PodInfo{
		Name:       pod.Name,
		Namespace:  pod.Namespace,
		Status:     string(pod.Status.Phase),
		Ready:      fmt.Sprintf("%d/%d", ready, len(pod.Spec.Containers)),
		Restarts:   restarts,
		Age:        time.Since(pod.CreationTimestamp.Time),
		Node:       pod.Spec.NodeName,
		IP:         pod.Status.PodIP,
		Labels:     pod.Labels,
	}
}

func podToDetail(pod *corev1.Pod) *PodDetail {
	info := podToInfo(pod)

	var containers []ContainerInfo
	for _, c := range pod.Spec.Containers {
		status := getContainerStatus(pod, c.Name)
		containers = append(containers, ContainerInfo{
			Name:         c.Name,
			Image:        c.Image,
			Ready:        status.Ready,
			RestartCount: status.RestartCount,
			State:        getContainerState(status),
		})
	}

	return &PodDetail{
		PodInfo:    info,
		Containers: containers,
	}
}

func getContainerStatus(pod *corev1.Pod, containerName string) corev1.ContainerStatus {
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.Name == containerName {
			return cs
		}
	}
	return corev1.ContainerStatus{}
}

func getContainerState(status corev1.ContainerStatus) string {
	if status.State.Running != nil {
		return "Running"
	}
	if status.State.Waiting != nil {
		return fmt.Sprintf("Waiting: %s", status.State.Waiting.Reason)
	}
	if status.State.Terminated != nil {
		return fmt.Sprintf("Terminated: %s", status.State.Terminated.Reason)
	}
	return "Unknown"
}

func getExternalIP(svc *corev1.Service) string {
	if len(svc.Status.LoadBalancer.Ingress) > 0 {
		if svc.Status.LoadBalancer.Ingress[0].IP != "" {
			return svc.Status.LoadBalancer.Ingress[0].IP
		}
		return svc.Status.LoadBalancer.Ingress[0].Hostname
	}
	if len(svc.Spec.ExternalIPs) > 0 {
		return svc.Spec.ExternalIPs[0]
	}
	return ""
}
